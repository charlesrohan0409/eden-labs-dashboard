// Invoice numbering and the HTML document used for both the print/download
// flow and the email body — one template, two destinations.

import { escapeHtml } from "./utils.js";

// Sequential display number based on position in the store — same scheme
// FinanceDetail has always used, just centralised so the modal that creates
// an invoice and the table that lists them agree on the number.
export function invoiceNumber(id, invoices) {
  const idx = invoices.findIndex((i) => i.id === id);
  return `INV-${String(1000 + (idx === -1 ? invoices.length : idx) + 1)}`;
}

// Invoices are stored in USD; `fmt` is injected by the caller so the document
// renders in whatever display currency is active (see lib/currency.js).
const defaultFmt = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * A self-contained HTML document — no external stylesheet, no assets — so it
 * renders identically whether it's opened in a print tab or dropped straight
 * into an email client.
 */
export function buildInvoiceDocument({ invoice, client, number, fmtMoney = defaultFmt }) {
  const lineLabel = invoice.description?.trim() || "Services rendered";
  const total = Number(invoice.amount) || 0;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice ${number}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1c1917; margin:0; padding:40px; background:#fff; }
  .wrap { max-width: 640px; margin: 0 auto; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; }
  .brand { font-size:20px; font-weight:700; letter-spacing:-0.02em; }
  .brand-sub { font-size:11px; color:#78716c; margin-top:2px; letter-spacing:0.08em; text-transform:uppercase; }
  .status { display:inline-block; padding:4px 12px; border-radius:999px; font-size:11px; font-weight:600; background:${invoice.status === "paid" ? "#ecfdf5" : "#fffbeb"}; color:${invoice.status === "paid" ? "#047857" : "#b45309"}; }
  .meta { display:flex; gap:36px; margin-bottom:24px; flex-wrap:wrap; }
  .meta div { font-size:12px; color:#78716c; }
  .meta strong { display:block; font-size:14px; color:#1c1917; font-weight:600; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  th { text-align:left; font-size:11px; color:#78716c; text-transform:uppercase; letter-spacing:0.04em; border-bottom:1px solid #e7e4de; padding:8px 0; }
  td { padding:14px 0; border-bottom:1px solid #f4f3f0; font-size:14px; }
  .amount { text-align:right; font-variant-numeric: tabular-nums; }
  .total-row td { border-bottom:none; padding-top:16px; font-weight:700; font-size:17px; }
  .notes { font-size:13px; color:#57534e; margin-bottom:20px; white-space:pre-wrap; }
  .footer { margin-top:28px; padding-top:16px; border-top:1px solid #e7e4de; font-size:11px; color:#a8a29e; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <div class="brand">Eden Labs</div>
        <div class="brand-sub">Invoice</div>
      </div>
      <span class="status">${invoice.status === "paid" ? "Paid" : "Payment due"}</span>
    </div>

    <div class="meta">
      <div>Invoice number<strong>${number}</strong></div>
      <div>Issue date<strong>${fmtDate(invoice.date)}</strong></div>
      <div>Due date<strong>${fmtDate(invoice.dueDate || invoice.date)}</strong></div>
    </div>

    <div class="meta">
      <div>Billed to<strong>${escapeHtml(client?.company || client?.name || "—")}</strong></div>
      <div>Contact<strong>${escapeHtml(client?.name || "—")}</strong></div>
      <div>Email<strong>${escapeHtml(client?.email || "—")}</strong></div>
    </div>

    <table>
      <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        <tr><td>${escapeHtml(lineLabel)}</td><td class="amount">${fmtMoney(total)}</td></tr>
        <tr class="total-row"><td>Total</td><td class="amount">${fmtMoney(total)}</td></tr>
      </tbody>
    </table>

    ${invoice.notes?.trim() ? `<div class="notes">${escapeHtml(invoice.notes)}</div>` : ""}

    <div class="footer">Eden Labs · Thank you for your business.</div>
  </div>
</body>
</html>`;
}

export function buildInvoiceEmailText({ invoice, client, number, fmtMoney = defaultFmt }) {
  const lineLabel = invoice.description?.trim() || "Services rendered";
  return [
    `Invoice ${number} from Eden Labs`,
    "",
    `Billed to: ${client?.company || client?.name || "—"}`,
    `${lineLabel}: ${fmtMoney(invoice.amount)}`,
    `Due: ${fmtDate(invoice.dueDate || invoice.date)}`,
    "",
    invoice.notes?.trim() || "",
    "— Eden Labs",
  ].filter(Boolean).join("\n");
}
