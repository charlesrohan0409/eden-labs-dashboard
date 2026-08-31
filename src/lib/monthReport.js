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

/** The previous `count` months, oldest first, ending at `key`. */
export function monthsUpTo(key, count) {
  const [y, m] = key.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * The same report, for several months, so the headline number has something
 * to be compared against. A single month in isolation says almost nothing —
 * "₹1.7L of costs" only means something next to the three months before it.
 */
export function buildTrend(data, key, count = 6) {
  return monthsUpTo(key, count).map((k) => buildMonthReport(data, k));
}

/** Change vs the previous month, and vs the average of the ones before that. */
export function compareTo(series) {
  const cur = series.at(-1);
  const prev = series.at(-2);
  const earlier = series.slice(0, -1);
  const avg = (pick) =>
    earlier.length ? earlier.reduce((s, r) => s + pick(r), 0) / earlier.length : 0;
  const delta = (now, then) => {
    if (!then) return null;                 // no baseline — "—", not "+100%"
    return Math.round(((now - then) / Math.abs(then)) * 100);
  };
  return {
    cur, prev,
    revenueVsPrev: prev ? delta(cur.revenue, prev.revenue) : null,
    costsVsPrev:   prev ? delta(cur.costs, prev.costs) : null,
    profitVsPrev:  prev ? delta(cur.profit, prev.profit) : null,
    revenueVsAvg:  delta(cur.revenue, avg((r) => r.revenue)),
    avgRevenue:    avg((r) => r.revenue),
    avgCosts:      avg((r) => r.costs),
  };
}

// ---- charts -------------------------------------------------------------
//
// Hand-written SVG rather than a charting library. This document is printed,
// so it needs to be resolution-independent and to survive with no JavaScript
// running at all — an SVG in the markup satisfies both, and adds nothing to
// the bundle for a page opened twelve times a year.

const CHART = { w: 660, h: 180, pad: { t: 14, r: 8, b: 26, l: 52 } };

const niceMax = (v) => {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
};

/**
 * Grouped bars — revenue against costs, month by month.
 *
 * Two series side by side rather than stacked: the question this answers is
 * "did costs move with revenue", and stacking hides exactly that by making
 * one bar's height depend on the other's.
 */
export function groupedBars(rows, fmt) {
  const { w, h, pad } = CHART;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => [r.revenue, r.costs])));
  const slot = iw / Math.max(1, rows.length);
  const bw = Math.min(22, slot / 3);
  const y = (v) => pad.t + ih - (v / max) * ih;

  const gridlines = [0, 0.5, 1].map((f) => {
    const gy = pad.t + ih - f * ih;
    return `<line x1="${pad.l}" y1="${gy}" x2="${w - pad.r}" y2="${gy}" stroke="#e7e5e4" stroke-width="1"/>
            <text x="${pad.l - 6}" y="${gy + 3}" text-anchor="end" font-size="8" fill="#a8a29e">${escapeHtml(fmt(Math.round(max * f)))}</text>`;
  }).join("");

  const bars = rows.map((r, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const rY = y(r.revenue), cY = y(r.costs);
    return `
      <rect x="${cx - bw - 1}" y="${rY}" width="${bw}" height="${Math.max(0, pad.t + ih - rY)}" fill="#14532d" rx="2"/>
      <rect x="${cx + 1}" y="${cY}" width="${bw}" height="${Math.max(0, pad.t + ih - cY)}" fill="#d6d3d1" rx="2"/>
      <text x="${cx}" y="${h - 8}" text-anchor="middle" font-size="8.5" fill="#78716c">${escapeHtml(r.label.split(" ")[0].slice(0, 3))}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">
    ${gridlines}${bars}
  </svg>`;
}

/** A single-series line, for a count that only makes sense as a shape. */
export function lineChart(rows, pick, color = "#14532d") {
  const { w, h, pad } = CHART;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const vals = rows.map(pick);
  const max = niceMax(Math.max(1, ...vals));
  const x = (i) => pad.l + (iw / Math.max(1, rows.length - 1)) * i;
  const y = (v) => pad.t + ih - (v / max) * ih;
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${pad.l},${pad.t + ih} ${pts} ${x(rows.length - 1)},${pad.t + ih}`;

  const gridlines = [0, 0.5, 1].map((f) => {
    const gy = pad.t + ih - f * ih;
    return `<line x1="${pad.l}" y1="${gy}" x2="${w - pad.r}" y2="${gy}" stroke="#e7e5e4" stroke-width="1"/>
            <text x="${pad.l - 6}" y="${gy + 3}" text-anchor="end" font-size="8" fill="#a8a29e">${Math.round(max * f)}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">
    ${gridlines}
    <polygon points="${area}" fill="${color}" opacity="0.10"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${color}"/>`).join("")}
    ${rows.map((r, i) => `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" font-size="8.5" fill="#78716c">${escapeHtml(r.label.split(" ")[0].slice(0, 3))}</text>`).join("")}
  </svg>`;
}

/** Horizontal funnel bars — each stage as a share of the one above it. */
export function funnelBars(stages) {
  const top = Math.max(1, stages[0]?.value || 1);
  return stages.map((st) => {
    const w = Math.max(1, Math.round((st.value / top) * 100));
    return `
      <div class="funnel-row">
        <div class="funnel-label">${escapeHtml(st.label)}</div>
        <div class="funnel-track"><div class="funnel-fill" style="width:${w}%"></div></div>
        <div class="funnel-value">${escapeHtml(String(st.value))}</div>
      </div>`;
  }).join("");
}

/**
 * The printable document.
 *
 * Deliberately one page of large, scannable numbers rather than a wall of
 * tables: this gets looked at once a month to answer "how did that month
 * go", and a report you have to study is a report you stop opening.
 */
export function buildMonthReportDocument(report, fmtMoney = (n) => String(n), trend = [], ledgerHtml = "", ledgerCss = "") {
  const r = report;
  const cmp = trend.length > 1 ? compareTo(trend) : null;
  // "+12%" / "−4%" / "—". An explicit sign because a bare number next to
  // last month's figure reads as a value rather than a change.
  const deltaHtml = (v, goodWhenUp = true) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return `<span class="muted">—</span>`;
    const up = v >= 0;
    const good = goodWhenUp ? up : !up;
    return `<span class="${good ? "up" : "down"}">${up ? "+" : "−"}${Math.abs(v)}%</span>`;
  };
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
    color: #1c1917; margin: 0 auto; padding: 32px; background: #fff;
    /* Roughly the printable width of A4. Without it the on-screen preview
       stretches to the window and the charts scale to twice their intended
       size, so what you check is not what prints. */
    max-width: 820px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @media print { body { max-width: none; padding: 0; } }
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
  .page-break { page-break-before: always; height: 0; }
  .chart { margin-top: 4px; }
  .legend { display: flex; gap: 16px; font-size: 10.5px; color: #78716c; margin-top: 4px; }
  .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; }
  .up { color: #15803d; font-weight: 600; }
  .down { color: #b91c1c; font-weight: 600; }
  .funnel-row { display: grid; grid-template-columns: 130px 1fr 48px; align-items: center;
                gap: 10px; margin-bottom: 7px; }
  .funnel-label { font-size: 11.5px; color: #57534e; }
  .funnel-track { background: #f5f5f4; border-radius: 4px; height: 16px; overflow: hidden; }
  .funnel-fill { background: #14532d; height: 100%; border-radius: 4px; }
  .funnel-value { font-size: 12px; font-weight: 650; text-align: right;
                  font-variant-numeric: tabular-nums; }
${ledgerCss}
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
    ${stat("Revenue", fmtMoney(r.revenue), r.revenueNote || `${r.paidCount} of ${r.invoiceCount} invoices paid`)}
    ${stat("Costs", fmtMoney(r.costs), r.costsNote || "Eden Labs book only")}
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

  <div class="page-break"></div>

  <div class="head">
    <div>
      <div class="brand">Eden Labs</div>
      <div class="period">Trends &amp; comparison · ${escapeHtml(r.label)}</div>
    </div>
    <div class="generated">Last ${trend.length} months</div>
  </div>

  ${trend.length > 1 ? `
  <section>
    <h2>Revenue vs costs</h2>
    <div class="chart">${groupedBars(trend, fmtMoney)}</div>
    <div class="legend">
      <span><i style="background:#14532d"></i>Revenue</span>
      <span><i style="background:#d6d3d1"></i>Costs</span>
    </div>
  </section>

  <section>
    <h2>How ${escapeHtml(r.label)} compares</h2>
    <table>
      <thead><tr>
        <th>Measure</th><th class="num">This month</th>
        <th class="num">Last month</th><th class="num">Change</th>
        <th class="num">${trend.length - 1}-month avg</th>
      </tr></thead>
      <tbody>
        <tr>
          <td>Revenue</td>
          <td class="num">${escapeHtml(fmtMoney(r.revenue))}</td>
          <td class="num muted">${escapeHtml(cmp?.prev ? fmtMoney(cmp.prev.revenue) : "—")}</td>
          <td class="num">${deltaHtml(cmp?.revenueVsPrev)}</td>
          <td class="num muted">${escapeHtml(fmtMoney(Math.round(cmp?.avgRevenue || 0)))}</td>
        </tr>
        <tr>
          <td>Costs</td>
          <td class="num">${escapeHtml(fmtMoney(r.costs))}</td>
          <td class="num muted">${escapeHtml(cmp?.prev ? fmtMoney(cmp.prev.costs) : "—")}</td>
          <td class="num">${deltaHtml(cmp?.costsVsPrev, false)}</td>
          <td class="num muted">${escapeHtml(fmtMoney(Math.round(cmp?.avgCosts || 0)))}</td>
        </tr>
        <tr>
          <td>Profit</td>
          <td class="num">${escapeHtml(fmtMoney(r.profit))}</td>
          <td class="num muted">${escapeHtml(cmp?.prev ? fmtMoney(cmp.prev.profit) : "—")}</td>
          <td class="num">${deltaHtml(cmp?.profitVsPrev)}</td>
          <td class="num muted">—</td>
        </tr>
        <tr>
          <td>Connections sent</td>
          <td class="num">${r.connectionsSent}</td>
          <td class="num muted">${cmp?.prev ? cmp.prev.connectionsSent : "—"}</td>
          <td class="num">${deltaHtml(cmp?.prev && cmp.prev.connectionsSent ? Math.round(((r.connectionsSent - cmp.prev.connectionsSent) / cmp.prev.connectionsSent) * 100) : null)}</td>
          <td class="num muted">—</td>
        </tr>
        <tr>
          <td>Calls booked</td>
          <td class="num">${r.callsBooked}</td>
          <td class="num muted">${cmp?.prev ? cmp.prev.callsBooked : "—"}</td>
          <td class="num">${deltaHtml(cmp?.prev && cmp.prev.callsBooked ? Math.round(((r.callsBooked - cmp.prev.callsBooked) / cmp.prev.callsBooked) * 100) : null)}</td>
          <td class="num muted">—</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Connections sent</h2>
    <div class="chart">${lineChart(trend, (x) => x.connectionsSent)}</div>
  </section>

  <section>
    <h2>${escapeHtml(r.label)} funnel</h2>
    <div class="funnel">
      ${funnelBars([
        { label: "Connections sent", value: r.connectionsSent },
        { label: "Accepted", value: r.accepted },
        { label: "Calls booked", value: r.callsBooked },
        { label: "Deals closed", value: r.dealsClosed },
      ])}
    </div>
  </section>` : `<section><p class="muted">Not enough history yet for comparisons.</p></section>`}

  <div class="foot">
    Generated ${escapeHtml(formatLongDate(new Date().toISOString().slice(0, 10)))} from Eden Labs Ops.
    Figures cover ${escapeHtml(r.label)} only. Costs exclude personal spending.
    Credit-card statement payments are transfers and are not counted as costs.
  </div>
${ledgerHtml}
</body></html>`;
}
