// The accounting half of the month-end report.
//
// buildMonthReport reads the dashboard's own arrays — invoices, expenses,
// outreach — and answers "how did the business do". This answers the other
// question: what do the books actually say. Income statement, balance sheet
// and cash flow, from the same ledger the Analysis page reads, so a figure
// printed here and a figure on screen cannot disagree.
//
// Everything renders as inline SVG and plain HTML. The report is opened in a
// print window and turned into a PDF by the browser itself, which means no
// chart library survives the trip — anything that needs JavaScript to draw
// arrives blank on paper.

import { balanceSheet, cashFlow, incomeStatement, monthlySeries, spendingByGroup, groupLabel, netWorthSeries } from "./ledgerAnalysis.js";
import { topPayees, recurring, categorySeries } from "./ledgerInsights.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const INR = (n) => (n < 0 ? "−" : "") + "₹" + Math.round(Math.abs(Number(n) || 0)).toLocaleString("en-IN");

const C = { ink: "#1c1917", green: "#14532d", grey: "#d6d3d1", line: "#e7e5e4", muted: "#a8a29e", rose: "#b91c1c" };
const PALETTE = ["#14532d", "#7c3aed", "#0369a1", "#b45309", "#0d9488", "#be185d", "#0891b2", "#9333ea", "#ca8a04", "#78716c"];

/** Month bounds as ISO dates, for windowing the ledger. */
export function monthWindow(key) {
  const [y, m] = String(key).split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
};

/** Horizontal bars — reads better than a pie when the labels are words. */
function barsH(rows, { width = 520, rowH = 22 } = {}) {
  if (!rows.length) return `<p class="muted">Nothing to show.</p>`;
  const labelW = 116, valueW = 78;
  const iw = width - labelW - valueW;
  const max = niceMax(Math.max(...rows.map((r) => Math.abs(r.value))));
  const h = rows.length * rowH + 6;
  const bars = rows.map((r, i) => {
    const y = i * rowH + 3;
    const w = Math.max(1, (Math.abs(r.value) / max) * iw);
    return `<text x="${labelW - 8}" y="${y + 12}" text-anchor="end" font-size="9" fill="${C.ink}">${esc(r.label)}</text>
      <rect x="${labelW}" y="${y + 3}" width="${w}" height="11" rx="2" fill="${r.color || C.green}"/>
      <text x="${width - 4}" y="${y + 12}" text-anchor="end" font-size="9" fill="${C.muted}">${esc(INR(r.value))}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${h}" width="100%" role="img">${bars}</svg>`;
}

/** Income against spending, month by month. */
function monthlyBars(rows, { width = 520, height = 150 } = {}) {
  if (!rows.length) return `<p class="muted">Not enough history.</p>`;
  const pad = { l: 46, r: 6, t: 8, b: 20 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => [r.income, r.expense])));
  const slot = iw / rows.length;
  const bw = Math.min(14, slot / 3);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const grid = [0, 0.5, 1].map((f) => {
    const gy = pad.t + ih - f * ih;
    return `<line x1="${pad.l}" y1="${gy}" x2="${width - pad.r}" y2="${gy}" stroke="${C.line}"/>
      <text x="${pad.l - 6}" y="${gy + 3}" text-anchor="end" font-size="7.5" fill="${C.muted}">${esc(INR(max * f))}</text>`;
  }).join("");
  const bars = rows.map((r, i) => {
    const cx = pad.l + slot * i + slot / 2;
    return `<rect x="${cx - bw - 1}" y="${y(r.income)}" width="${bw}" height="${Math.max(0, pad.t + ih - y(r.income))}" fill="${C.green}" rx="1.5"/>
      <rect x="${cx + 1}" y="${y(r.expense)}" width="${bw}" height="${Math.max(0, pad.t + ih - y(r.expense))}" fill="${C.grey}" rx="1.5"/>
      <text x="${cx}" y="${height - 6}" text-anchor="middle" font-size="7.5" fill="${C.muted}">${esc(r.label)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img">${grid}${bars}</svg>`;
}

/** A single series as an area — net worth, or one category over time. */
function areaChart(rows, pick, { width = 520, height = 130, color = C.green } = {}) {
  if (rows.length < 2) return `<p class="muted">Not enough history.</p>`;
  const pad = { l: 46, r: 6, t: 8, b: 18 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const vals = rows.map(pick);
  const lo = Math.min(0, ...vals), hi = niceMax(Math.max(1, ...vals));
  const x = (i) => pad.l + (iw / Math.max(1, rows.length - 1)) * i;
  const y = (v) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const fill = `${line} L${x(rows.length - 1).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z`;
  const grid = [0, 0.5, 1].map((f) => {
    const gy = pad.t + ih - f * ih;
    return `<line x1="${pad.l}" y1="${gy}" x2="${width - pad.r}" y2="${gy}" stroke="${C.line}"/>
      <text x="${pad.l - 6}" y="${gy + 3}" text-anchor="end" font-size="7.5" fill="${C.muted}">${esc(INR(lo + (hi - lo) * f))}</text>`;
  }).join("");
  const labels = rows.map((r, i) =>
    (i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2))
      ? `<text x="${x(i)}" y="${height - 5}" text-anchor="middle" font-size="7.5" fill="${C.muted}">${esc(r.label)}</text>` : "").join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img">
    ${grid}<path d="${fill}" fill="${color}" opacity="0.12"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8"/>${labels}</svg>`;
}

const row = (label, value, cls = "") =>
  `<tr class="${cls}"><td>${esc(label)}</td><td class="num">${esc(INR(value))}</td></tr>`;

/**
 * The accounting pages, as HTML ready to paste into the report document.
 *
 * Returns a string rather than a component because the report is written into
 * a print window with document.write — there is no React on the other side.
 */
export function buildLedgerSections(ledger, monthKey) {
  if (!ledger?.length) return "";
  const win = monthWindow(monthKey);
  const pnl = incomeStatement(ledger, win);
  const sheet = balanceSheet(ledger, { asOf: win.to });
  const flow = cashFlow(ledger, win);
  const months = monthlySeries(ledger, { months: 12 });
  const groups = spendingByGroup(ledger, win).filter((g) => g.amount > 0).slice(0, 10);
  const payees = topPayees(ledger, { ...win, limit: 10 });
  const worth = netWorthSeries(ledger, { months: 12 });
  const commitments = recurring(ledger).filter((r) => r.confident && !r.conduit);
  const conduit = monthlySeries(ledger, win).reduce((s, m) => s + m.conduit, 0);

  // Biggest category, tracked over the year — a total says food cost ₹15k
  // this month; only the shape says whether that is normal.
  const lead = groups[0];
  const leadSeries = lead ? categorySeries(ledger, lead.group, { months: 12 }) : [];

  const pnlRows = [
    ...pnl.income.map((r) => row(r.label, r.amount)),
    row("Total earned", pnl.totalIncome, "total"),
    ...pnl.businessCosts.map((r) => row(r.label, -r.amount)),
    row("Business profit", pnl.businessProfit, "total"),
    row("Personal spending", -pnl.totalPersonalCosts),
    // Below the profit line on purpose — a holding worth more than you paid
    // is real, but it is not what the business earned this month.
    ...(pnl.gains.length
      ? [`<tr class="head"><td colspan="2">Value changes, not earnings</td></tr>`,
         ...pnl.gains.map((r) => row(r.label, r.amount))]
      : []),
    row("Net", pnl.net, "grand"),
  ].join("");

  const sheetRows = [
    `<tr class="head"><td colspan="2">Assets</td></tr>`,
    ...sheet.assets.map((a) => row(a.label, a.amount)),
    row("Total assets", sheet.totalAssets, "total"),
    `<tr class="head"><td colspan="2">Liabilities</td></tr>`,
    ...(sheet.liabilities.length ? sheet.liabilities.map((a) => row(a.label, a.amount)) : [`<tr><td class="muted" colspan="2">Nothing owed.</td></tr>`]),
    row("Total owed", sheet.totalLiabilities, "total"),
    row("Net worth", sheet.netWorth, "grand"),
  ].join("");

  const flowRows = [
    ["Operating", flow.operating, "income less spending"],
    ["Investing", flow.investing, "into and out of investments"],
    ["Financing", flow.financing, "borrowing and repayment"],
    ["Family money", flow.conduit, "net of what came in and went back out"],
  ].map(([l, v, note]) =>
    `<tr><td>${esc(l)}<div class="sub">${esc(note)}</div></td><td class="num">${esc(INR(v))}</td></tr>`).join("");

  return `
  <div class="page-break"></div>
  <section>
    <h2>The books</h2>
    <p class="lede">Everything below comes from the ledger — the same figures the Analysis page shows,
    derived from statements that reconciled against the bank to the rupee.</p>

    <div class="two">
      <div class="panel">
        <h3>Income statement</h3>
        <table class="fin">${pnlRows}</table>
      </div>
      <div class="panel">
        <h3>Balance sheet <span class="muted">as at ${esc(win.to)}</span></h3>
        <table class="fin">${sheetRows}</table>
      </div>
    </div>

    <div class="two">
      <div class="panel">
        <h3>Cash flow</h3>
        <table class="fin">${flowRows}</table>
        ${conduit > 0 ? `<p class="foot">${esc(INR(conduit))} of family money passed through this month.
          It moved real cash but was never yours, so it appears here and in no income figure.</p>` : ""}
      </div>
      <div class="panel">
        <h3>Committed every month</h3>
        ${commitments.length
          ? `<table class="fin">${commitments.slice(0, 8).map((c) => row(c.name, c.amount)).join("")}
             ${row("A year of that", commitments.reduce((s, c) => s + c.annualised, 0), "total")}</table>`
          : `<p class="muted">Nothing repeats on a fixed day yet.</p>`}
      </div>
    </div>
  </section>

  <div class="page-break"></div>
  <section>
    <h2>How the money moved</h2>
    <div class="panel">
      <h3>Income against spending, last 12 months</h3>
      ${monthlyBars(months)}
      <p class="legend"><span class="key" style="background:${C.green}"></span>Income
        <span class="key" style="background:${C.grey}"></span>Spending</p>
    </div>
    <div class="two">
      <div class="panel">
        <h3>Where it went this month</h3>
        ${barsH(groups.map((g, i) => ({ label: groupLabel(g.group), value: g.amount, color: PALETTE[i % PALETTE.length] })))}
      </div>
      <div class="panel">
        <h3>Who you paid most</h3>
        ${barsH(payees.map((p, i) => ({ label: p.name.slice(0, 18), value: p.amount, color: PALETTE[i % PALETTE.length] })))}
      </div>
    </div>
    <div class="two">
      <div class="panel">
        <h3>Net worth, month by month</h3>
        ${areaChart(worth, (r) => r.netWorth)}
      </div>
      <div class="panel">
        <h3>${esc(lead ? groupLabel(lead.group) : "Biggest category")} over the year</h3>
        ${areaChart(leadSeries, (r) => r.amount, { color: PALETTE[0] })}
        ${lead ? `<p class="foot">${esc(INR(lead.amount))} this month, against a
          ${esc(INR(leadSeries.reduce((s, r) => s + r.amount, 0) / Math.max(1, leadSeries.length)))} monthly average.</p>` : ""}
      </div>
    </div>
  </section>`;
}

/** Extra print styles the sections above rely on. */
export const LEDGER_REPORT_CSS = `
  .page-break { page-break-before: always; }
  .lede { color: #57534e; font-size: 11px; margin: 0 0 14px; max-width: 62ch; line-height: 1.5; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .panel { border: 1px solid ${C.line}; border-radius: 10px; padding: 12px 14px; break-inside: avoid; }
  .panel h3 { font-size: 11.5px; margin: 0 0 9px; font-weight: 600; }
  table.fin { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.fin td { padding: 3.5px 0; border-bottom: 1px solid #f5f5f4; }
  table.fin td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.fin tr.head td { font-size: 8.5px; text-transform: uppercase; letter-spacing: .07em; color: ${C.muted};
    padding-top: 9px; border-bottom: 0; }
  table.fin tr.total td { font-weight: 600; border-bottom: 1px solid ${C.line}; }
  table.fin tr.grand td { font-weight: 700; border-bottom: 0; padding-top: 6px; }
  table.fin .sub { font-size: 8.5px; color: ${C.muted}; }
  .legend { font-size: 9px; color: ${C.muted}; margin: 6px 0 0; }
  .key { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin: 0 4px 0 10px; vertical-align: middle; }
  .legend .key:first-child { margin-left: 0; }
  .foot { font-size: 9px; color: #57534e; margin: 8px 0 0; line-height: 1.45; }
  @media print { .panel { border-color: #ddd; } }
`;

/**
 * Replaces the report's headline figures with the ledger's.
 *
 * buildMonthReport derives revenue from `invoices` and costs from `expenses`
 * — arrays that are barely used, because the real money arrives as bank
 * transactions. The result was a document whose first page claimed ₹157 of
 * revenue while its third page, reading the ledger, said ₹1,14,754 earned.
 * One report cannot hold two answers to the same question.
 *
 * The growth and delivery figures are left alone: connections sent and posts
 * published are genuinely dashboard data and the ledger knows nothing of them.
 */
export function withLedgerHeadline(report, ledger, monthKey) {
  if (!ledger?.length) return report;
  const win = monthWindow(monthKey);
  const pnl = incomeStatement(ledger, win);
  const revenue = pnl.totalIncome;
  const costs = pnl.totalBusinessCosts + pnl.totalPersonalCosts;
  return {
    ...report,
    revenue, costs,
    profit: revenue - costs,
    margin: revenue ? Math.round(((revenue - costs) / revenue) * 100) : 0,
    // The subtitle under "COSTS" said "Eden Labs book only", which stops
    // being true once personal spending is in the figure.
    costsNote: "business and personal, from your statements",
    // "1 of 1 invoices paid" described a figure that no longer comes from
    // invoices — the money arrives as bank transactions, and that is what
    // this now counts.
    revenueNote: "everything earned, from your statements",
    // The breakdown has to move with the headline. Left on the old source it
    // listed ₹71 of software under a ₹32,439 total and computed every share
    // as 0% — a table that contradicts the number directly above it.
    byCategory: spendingByGroup(ledger, win)
      .filter((g) => g.amount > 0)
      .map((g) => [groupLabel(g.group), g.amount]),
  };
}

/**
 * Six months of revenue and costs, for the comparison chart — from the ledger,
 * so the trend is on the same scale as the headline it sits under.
 */
export function ledgerTrend(ledger, monthKey, count = 6) {
  if (!ledger?.length) return [];
  const [y, m] = String(monthKey).split("-").map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const p = incomeStatement(ledger, monthWindow(key));
    out.push({
      key,
      label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      revenue: p.totalIncome,
      costs: p.totalBusinessCosts + p.totalPersonalCosts,
      profit: p.totalIncome - p.totalBusinessCosts - p.totalPersonalCosts,
    });
  }
  return out;
}
