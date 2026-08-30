// The month-end report.
//
// Built as a self-contained HTML document and handed to the browser's own
// print-to-PDF, exactly like the invoice document — no PDF library, no
// server round trip, and what you see in the print preview is what lands in
// the file. A generated PDF that needs a 400KB dependency to render a page
// of numbers is the wrong trade for something opened twelve times a year.
//
// Every figure here is DERIVED from the same helpers the dashboard screens
// use. Nothing is recomputed with its own private arithmetic — that is
// precisely how a report ends up disagreeing with the app it came from,
// which is the failure mode this codebase has already been bitten by more
// than once.

import { escapeHtml, formatLongDate } from "./utils.js";
import { effectiveInvoiceStatus, bookOf } from "./finance.js";
import { sumEntries, reconcileWithCrm, crmReached } from "./outreach.js";

/** First and last day of a "YYYY-MM", as date keys. */
export function monthBounds(key) {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * Is the month `key` finished, or finishing within `graceDays`?
 *
 * The report button is meant to appear when the month is actually wrapping
 * up rather than sitting there all month as a thing you could click but
 * shouldn't. A few days of lead-in matters because the last working day is
 * rarely the 31st.
 */
export function isMonthEnd(now = new Date(), graceDays = 3) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() > daysInMonth - graceDays;
}

/** The month a report should default to: the one just finished, or ending. */
export function reportMonthFor(now = new Date()) {
  const d = new Date(now);
  // Before the wrap-up window, the month worth reporting on is the previous
  // one — on the 4th you want September's report, not a third of October's.
  if (!isMonthEnd(now)) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Everything the report states, gathered in one place so the numbers can be
 * checked without reading the markup.
 */
export function buildMonthReport(data, key) {
  const { from, to } = monthBounds(key);
  const inRange = (date) => date && date >= from && date <= to;

  const invoices = (data.invoices || []).filter((i) => inRange(i.date));
  const paid = invoices.filter((i) => i.status === "paid");
  const revenue = paid.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // Business book only. A month-end report for the agency that quietly
  // included personal groceries would misstate the margin.
  const expenses = (data.expenses || []).filter((e) => inRange(e.date) && bookOf(e) === "business");
  const costs = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const byCategory = Object.entries(
    expenses.reduce((acc, e) => {
      const k = e.category || "Uncategorised";
      acc[k] = (acc[k] || 0) + (Number(e.amount) || 0);
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const outreach = reconcileWithCrm(
    sumEntries(data.outreachLog || [], from),
    data.contacts,
    from
  );
  // sumEntries has no upper bound, so trim to the month explicitly rather
  // than letting a report for August quietly include September's work.
  const monthEntries = (data.outreachLog || []).filter((e) => inRange(e.date));
  const outreachExact = reconcileWithCrm(sumEntries(monthEntries, from), data.contacts, from);

  const posts = (data.posts || []).filter((p) => inRange(p.date) && p.status === "published");

  const overdue = (data.invoices || []).filter((i) => effectiveInvoiceStatus(i) === "overdue");

  return {
    key, label: monthLabel(key), from, to,
    revenue, costs, profit: revenue - costs,
    margin: revenue ? Math.round(((revenue - costs) / revenue) * 100) : 0,
    invoiceCount: invoices.length,
    paidCount: paid.length,
    byCategory,
    outreach: outreachExact,
    connectionsSent: outreachExact.linkedinConnectionsSent,
    accepted: outreachExact.linkedinConnectionsAccepted,
    callsBooked: outreachExact.linkedinCallsBooked + (outreachExact.emailCallsBooked || 0),
    dealsClosed: crmReached(data.contacts, "closed", from),
    postsPublished: posts.length,
    overdueCount: overdue.length,
    overdueTotal: overdue.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    activeClients: (data.clients || []).filter((c) => c.status === "active").length,
  };
}

const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

/**
 * The printable document.
 *
 * Deliberately one page of large, scannable numbers rather than a wall of
 * tables: this gets looked at once a month to answer "how did that month
 * go", and a report you have to study is a report you stop opening.
 */
export function buildMonthReportDocument(report, fmtMoney = (n) => String(n)) {
  const r = report;
  const stat = (label, value, note = "") => `
    <div class="stat">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(String(value))}</div>
      ${note ? `<div class="stat-note">${escapeHtml(note)}</div>` : ""}
    </div>`;

  const categoryRows = r.byCategory.length
    ? r.byCategory.map(([name, amt]) => `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td class="num">${escapeHtml(fmtMoney(amt))}</td>
          <td class="num muted">${escapeHtml(pct(amt, r.costs))}</td>
        </tr>`).join("")
    : `<tr><td colspan="3" class="muted">No expenses recorded.</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Eden Labs — ${escapeHtml(r.label)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif;
    color: #1c1917; margin: 0; padding: 32px; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-end;
          border-bottom: 2px solid #14532d; padding-bottom: 14px; margin-bottom: 26px; }
  .brand { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #14532d; }
  .period { font-size: 13px; color: #78716c; margin-top: 2px; }
  .generated { font-size: 11px; color: #a8a29e; text-align: right; }

  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 26px; }
  .stat { border: 1px solid #e7e5e4; border-radius: 10px; padding: 12px 14px; }
  .stat-label { font-size: 10px; font-weight: 600; text-transform: uppercase;
                letter-spacing: 0.05em; color: #a8a29e; }
  .stat-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px;
                font-variant-numeric: tabular-nums; }
  .stat-note { font-size: 10.5px; color: #a8a29e; margin-top: 2px; }

  .hero { background: #14532d; color: #fff; border-radius: 12px; padding: 20px 22px;
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 26px; }
  .hero .stat-label { color: rgba(255,255,255,.6); }
  .hero .stat-value { color: #fff; font-size: 26px; }
  .hero .stat-note { color: rgba(255,255,255,.55); }

  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
       color: #78716c; margin: 0 0 10px; font-weight: 650; }
  section { margin-bottom: 24px; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
       color: #a8a29e; font-weight: 600; padding: 0 0 6px; border-bottom: 1px solid #e7e5e4; }
  td { padding: 7px 0; border-bottom: 1px solid #f5f5f4; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #a8a29e; }
  .warn { color: #9f1239; }
  .foot { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e7e5e4;
          font-size: 10.5px; color: #a8a29e; }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="brand">Eden Labs</div>
      <div class="period">Month in review · ${escapeHtml(r.label)}</div>
    </div>
    <div class="generated">
      ${escapeHtml(formatLongDate(r.from))} – ${escapeHtml(formatLongDate(r.to))}
    </div>
  </div>

  <div class="hero">
    ${stat("Revenue", fmtMoney(r.revenue), `${r.paidCount} of ${r.invoiceCount} invoices paid`)}
    ${stat("Costs", fmtMoney(r.costs), "Eden Labs book only")}
    ${stat("Profit", fmtMoney(r.profit), `${r.margin}% margin`)}
  </div>

  <section>
    <h2>Growth</h2>
    <div class="grid">
      ${stat("Connections sent", r.connectionsSent)}
      ${stat("Accepted", r.accepted, pct(r.accepted, r.connectionsSent) + " acceptance")}
      ${stat("Calls booked", r.callsBooked)}
      ${stat("Deals closed", r.dealsClosed)}
    </div>
  </section>

  <section>
    <h2>Delivery</h2>
    <div class="grid">
      ${stat("Posts published", r.postsPublished)}
      ${stat("Active clients", r.activeClients)}
      ${stat("Overdue invoices", r.overdueCount, r.overdueCount ? fmtMoney(r.overdueTotal) + " outstanding" : "All clear")}
      ${stat("Avg revenue / client", r.activeClients ? fmtMoney(Math.round(r.revenue / r.activeClients)) : "—")}
    </div>
  </section>

  <section>
    <h2>Where the money went</h2>
    <table>
      <thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
      <tbody>${categoryRows}</tbody>
    </table>
  </section>

  <div class="foot">
    Generated ${escapeHtml(formatLongDate(new Date().toISOString().slice(0, 10)))} from Eden Labs Ops.
    Figures cover ${escapeHtml(r.label)} only. Costs exclude personal spending.
    Credit-card statement payments are transfers and are not counted as costs.
  </div>
</body></html>`;
}
