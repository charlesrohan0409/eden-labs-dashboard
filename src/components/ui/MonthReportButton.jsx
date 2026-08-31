import { useState } from "react";
import { FileText, X } from "lucide-react";
import { useCurrency } from "../../hooks/useCurrency";
import { formatAmount } from "../../lib/currency";
import {
  buildMonthReport, buildMonthReportDocument, isMonthEnd, reportMonthFor, monthLabel, buildTrend,
} from "../../lib/monthReport";
import { buildLedgerSections, LEDGER_REPORT_CSS, withLedgerHeadline, ledgerTrend } from "../../lib/ledgerReport";
import { useLedger } from "../../hooks/useLedger";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * The month-end report.
 *
 * Appears in the last few days of the month and stays available afterwards,
 * because the month you most want a report on is the one that just ended —
 * a button that vanished at midnight on the 31st would be gone exactly when
 * it became useful.
 *
 * Opens the document in a print window rather than downloading a file: the
 * browser's own print-to-PDF gives a real PDF with no dependency, and the
 * preview is the artefact, so there is no gap between what you check and
 * what you send.
 */
export default function MonthReportButton({ data, token, className = "" }) {
  const { rate, currency } = useCurrency();
  // The accounting pages come from the ledger, not the dashboard arrays, so a
  // figure printed here cannot disagree with one on the Analysis page.
  const { entries: ledger } = useLedger(token);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => reportMonthFor());
  // The report's own currency, independent of the dashboard's display
  // setting — you might work in USD day to day but need the month report in
  // rupees for an accountant. Defaults to whatever the app is showing.
  const [reportCurrency, setReportCurrency] = useState(currency || "INR");

  // Only in the wrap-up window. The rest of the month a report would be a
  // third of a month presented as a whole one.
  if (!isMonthEnd()) return null;

  // Never the masked formatter: hide-amounts is a screen-privacy setting for
  // working in public, and a document full of "••••••" is not a report. Same
  // reasoning as the invoice builder.
  const fmtMoney = (usd) =>
    formatAmount(reportCurrency === "INR" ? usd * rate : usd, {
      currency: reportCurrency,
      // Whole units. A month report is read at a glance and paise add
      // nothing but width.
      maximumFractionDigits: 0,
    });

  const openReport = () => {
    // The headline comes from the ledger when there is one, so page 1 and the
    // accounting pages cannot disagree about the same month.
    const report = withLedgerHeadline(buildMonthReport(data, month), ledger, month);
    // Six months so the charts have a shape and the comparison has a
    // baseline. The report itself is still about `month`.
    // Ledger trend when there is one, so the comparison chart sits on the same
    // scale as the headline above it.
    const fromLedger = ledgerTrend(ledger, month, 6);
    const trend = fromLedger.length ? fromLedger : buildTrend(data, month, 6);
    const html = buildMonthReportDocument(
      report, fmtMoney, trend,
      buildLedgerSections(ledger, month), LEDGER_REPORT_CSS,
    );
    const win = window.open("", "_blank");
    if (!win) return;             // popup blocked — the caller sees nothing happen
    win.document.write(html);
    win.document.close();
    // Waits for layout so the print dialog measures a finished page rather
    // than a half-styled one.
    win.onload = () => win.focus();
    setTimeout(() => { try { win.print(); } catch { /* user can print manually */ } }, 350);
    setOpen(false);
  };

  // Which months are offerable: this one and the previous five.
  const options = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs font-medium text-white
          bg-emerald-800 hover:bg-emerald-900 rounded-lg px-3 py-2 shrink-0
          transition-transform duration-150 ${EASE} active:scale-[0.97] ${className}`}
      >
        <FileText size={13} /> Month report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 motion-safe:animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Month report</div>
                <div className="text-xs text-stone-400 mt-0.5">Opens a print view — save as PDF from there</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close"
                className="p-1 rounded-md text-stone-300 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                <X size={15} />
              </button>
            </div>

            <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
              Month
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              {options.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
            </select>

            <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1 mt-3">
              Currency
            </label>
            <select
              value={reportCurrency}
              onChange={(e) => setReportCurrency(e.target.value)}
              className="border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              <option value="INR">₹ Rupees</option>
              <option value="USD">$ Dollars</option>
            </select>

            <button
              onClick={openReport}
              className={`w-full mt-4 text-sm font-medium bg-emerald-800 text-white rounded-lg py-2.5
                transition-transform duration-150 ${EASE} active:scale-[0.98] hover:bg-emerald-900`}
            >
              Generate
            </button>
          </div>
        </div>
      )}
    </>
  );
}
