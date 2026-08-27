import { useEffect, useState, useRef} from "react";
import { Plus, Download, Send, Loader2, CheckCircle2, FileText } from "lucide-react";
import Modal from "./Modal";
import Badge from "./Badge";
import PrimaryButton from "./PrimaryButton";
import { today, addDays, uid, commissionInstallment } from "../../lib/utils";
import { invoiceNumber, buildInvoiceDocument, buildInvoiceEmailText } from "../../lib/invoice";
import { sendEmail } from "../../lib/email";
import { useCurrency } from "../../hooks/useCurrency";
import { CURRENCIES, formatAmount, fetchUsdToInr } from "../../lib/currency";

const EMPTY_FORM = { clientId: "", description: "", amount: "", currency: "USD", issueDate: today(), dueDate: addDays(today(), 14), notes: "", accountId: "" };

/**
 * Create a single ad-hoc invoice. Two phases in one modal: fill in the
 * details, then — once it exists — download it as a PDF or email it for
 * real. Nothing here touches the recurring "bill every active client" flow.
 */
export default function InvoiceModal({ open, onClose, clients, invoices, accounts = [], onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState(null); // the invoice once it exists
  const [sendStatus, setSendStatus] = useState("");
  const [sendError, setSendError] = useState("");
  const resetTimer = useRef(null);
  useEffect(() => () => clearTimeout(resetTimer.current), []);
  const [sending, setSending] = useState(false);
  const { moneyIn } = useCurrency();
  // The invoice's OWN currency — not the dashboard's display setting.
  const invCurrency = created?.currency || form.currency;
  // 2dp on an invoice — a document should show exact cents/paise.
  //
  // Deliberately formatAmount, NOT money()/moneyIn(): those mask to "••••••"
  // when hide-amounts is on, which previously meant downloading or emailing
  // an invoice with privacy mode enabled produced a document reading
  // "Total: ••••••". A document leaving the building must never be masked.
  const fmtMoney = (n) => formatAmount(n, { currency: invCurrency, decimals: 2 });

  // The FX rate for the picked currency, frozen onto the invoice at creation
  // so its USD equivalent stays auditable. Fetched here rather than read off
  // the currency context because the context only fetches a rate when the
  // GLOBAL display setting is non-USD — on a USD dashboard it reports rate 1,
  // which would record a ₹50,000 invoice as $50,000.
  const [fx, setFx] = useState({ rate: 1, loading: false, stale: false });
  useEffect(() => {
    if (form.currency === "USD") { setFx({ rate: 1, loading: false, stale: false }); return; }
    let cancelled = false;
    setFx((f) => ({ ...f, loading: true }));
    fetchUsdToInr().then((res) => {
      if (!cancelled) setFx({ rate: res.rate, loading: false, stale: res.stale });
    });
    return () => { cancelled = true; };
  }, [form.currency]);

  const client = clients.find((c) => c.id === (created?.clientId || form.clientId));

  const close = () => {
    onClose();
    // Reset after the close animation would run, if there were one. Tracked
    // so reopening inside 200ms doesn't get the form wiped out from under it.
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setForm(EMPTY_FORM);
      setCreated(null);
      setSendStatus("");
      setSendError("");
    }, 200);
  };

  const pickClient = (clientId) => {
    const c = clients.find((x) => x.id === clientId);
    const billingType = c?.contract?.billingType || "retainer";
    setForm((f) => ({
      ...f,
      clientId,
      // Prefill from the contract if the description/amount are still
      // blank — never overwrite something the user already typed. A
      // commission client's own invoices are installments, not the total,
      // so it prefills the per-period amount, not contract.value itself.
      description: f.description || (c ? (
        billingType === "oneTime" ? "One-time project fee"
        : billingType === "commission" ? "Commission installment"
        : `${new Date().toLocaleDateString(undefined, { month: "long" })} retainer`
      ) : ""),
      amount: f.amount || (c ? String(
        billingType === "commission"
          ? commissionInstallment(c.contract.value, c.contract.payoutMonths)
          : c.contract?.value || ""
      ) : f.amount),
    }));
  };

  const handleCreate = () => {
    if (!form.clientId || !Number(form.amount) || fx.loading) return;
    const nativeAmount = Number(form.amount);
    const rate = form.currency === "USD" ? 1 : fx.rate || 1;
    const invoice = {
      id: uid(),
      clientId: form.clientId,
      // What the client actually owes, in the currency they were billed in —
      // this is what the document prints, forever.
      nativeAmount,
      currency: form.currency,
      // Frozen at issue time so the USD figure below stays explainable later.
      fxRate: rate,
      // USD snapshot, so app-wide totals stay summable across currencies.
      amount: nativeAmount / rate,
      description: form.description.trim(),
      notes: form.notes.trim(),
      date: form.issueDate,
      dueDate: form.dueDate,
      period: form.issueDate.slice(0, 7),
      status: "pending",
      // Where the money lands when this gets paid. Recorded now, acted on
      // later: marking the invoice paid credits THIS account (see
      // updateInvoiceStatus), which is what makes income show up in balances
      // instead of only in the invoice list.
      accountId: form.accountId || null,
      settledIntoAccountId: null,
      settledAmount: null,
      paidAt: "",
    };
    onCreate(invoice);
    setCreated(invoice);
  };

  const number = created ? invoiceNumber(created.id, [...invoices, created]) : null;

  const handleDownload = () => {
    const html = buildInvoiceDocument({ invoice: created, client, number, fmtMoney });
    // A dedicated tab prints cleanly regardless of the modal's own layout,
    // and Chrome's print dialog defaults to "Save as PDF".
    const win = window.open("", "_blank");
    if (!win) {
      setSendError("Your browser blocked the new tab — allow popups for this site and try again.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const handleSend = async () => {
    if (!client?.email) {
      setSendError("This client has no email on file — add one from their client page first.");
      return;
    }
    setSending(true);
    setSendError("");
    setSendStatus("");
    try {
      await sendEmail({
        to: client.email,
        subject: `Invoice ${number} from Eden Labs`,
        html: buildInvoiceDocument({ invoice: created, client, number, fmtMoney }),
        text: buildInvoiceEmailText({ invoice: created, client, number, fmtMoney }),
      });
      setSendStatus(`Sent to ${client.email}.`);
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <Modal
      open={open}
      onClose={close}
      width="md"
      title={created ? `Invoice ${number}` : "New invoice"}
      subtitle={created ? "Download it, or send it for real" : "One-off — separate from the monthly retainer billing"}
      footer={
        created ? (
          <>
            <PrimaryButton variant="ghost" icon={Download} onClick={handleDownload}>Download PDF</PrimaryButton>
            <PrimaryButton icon={sending ? Loader2 : Send} onClick={handleSend} disabled={sending}>
              {sending ? "Sending…" : "Send email"}
            </PrimaryButton>
          </>
        ) : (
          <>
            <PrimaryButton variant="ghost" onClick={close}>Cancel</PrimaryButton>
            {/* Blocked while the FX rate is in flight — creating before it
                resolves would freeze rate 1 onto a non-USD invoice. */}
            <PrimaryButton icon={Plus} onClick={handleCreate} disabled={!form.clientId || !Number(form.amount) || fx.loading}>
              Create invoice
            </PrimaryButton>
          </>
        )
      }
    >
      {!created ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 font-medium">Client</label>
            <select value={form.clientId} onChange={(e) => pickClient(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="">Select a client…</option>
              {/* Hidden clients drop out of the picker but keep every invoice
                  and total they already have. */}
              {clients.filter((c) => !c.hidden).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-stone-500 font-medium">Receiving account</label>
            <select
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              className={`${inputCls} mt-1`}
            >
              <option value="">Don't track against a balance</option>
              {/* Credit cards excluded: an invoice is money coming IN, and a
                  card is a liability — "receiving" into one has no meaning. */}
              {accounts.filter((a) => a.type !== "credit").map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.currency ? ` · ${a.currency}` : ""}</option>
              ))}
            </select>
            <span className="block text-[10px] text-stone-400 mt-1">
              The balance goes up when you mark this invoice paid.
            </span>
          </div>

          <div>
            <label className="text-xs text-stone-500 font-medium">Description</label>
            <input
              placeholder="e.g. August retainer, one-off carousel design"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 font-medium">Amount</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="number" min="0" placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className={`${inputCls} flex-1`}
                />
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="border border-line rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20 shrink-0"
                >
                  {Object.values(CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-500 font-medium">Issue date</label>
              <input
                type="date" value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className={`${inputCls} mt-1`}
              />
            </div>
          </div>

          {/* What the invoice will actually say, plus the USD equivalent it's
              recorded at — so a non-USD invoice is never a black box. */}
          {form.currency !== "USD" && !!Number(form.amount) && (
            <div className="text-[11px] text-stone-500 bg-stone-50 border border-line rounded-lg px-3 py-2">
              {fx.loading ? (
                "Fetching today's exchange rate…"
              ) : (
                <>
                  This invoice bills{" "}
                  <span className="font-semibold text-stone-700 tnum">
                    {formatAmount(Number(form.amount), { currency: form.currency, decimals: 2 })}
                  </span>
                  . Recorded as{" "}
                  <span className="tnum">
                    {formatAmount(Number(form.amount) / (fx.rate || 1), { currency: "USD", decimals: 2 })}
                  </span>{" "}
                  for reporting, at 1 USD = {(fx.rate || 1).toFixed(2)} {form.currency}
                  {fx.stale ? " (approximate — couldn't reach the rate service)" : ""}.
                </>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-stone-500 font-medium">Due date</label>
            <input
              type="date" value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>

          <div>
            <label className="text-xs text-stone-500 font-medium">Notes (optional)</label>
            <textarea
              rows={2}
              placeholder="Shown at the bottom of the invoice"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={`${inputCls} mt-1 resize-none`}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Compact preview — the real document is the print/email HTML */}
          <div className="border border-line rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-stone-500">
                <FileText size={14} /> <span className="text-xs font-medium">Preview</span>
              </div>
              <Badge tone={created.status === "paid" ? "emerald" : "amber"}>
                {created.status === "paid" ? "Paid" : "Payment due"}
              </Badge>
            </div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-stone-500">Billed to</span>
              <span className="text-stone-800 font-medium">{client?.company || client?.name || "—"}</span>
            </div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-stone-500">{created.description || "Services rendered"}</span>
              <span className="text-stone-800 font-medium tnum">
                {moneyIn(created.nativeAmount ?? created.amount, created.currency)}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-stone-100 mt-2">
              <span className="text-stone-500">Due</span>
              <span className="text-stone-800 font-medium">{new Date(created.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
          </div>

          {!client?.email && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              {client?.name} has no email on file — you can still download the PDF, but sending needs one.
            </div>
          )}
          {sendStatus && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              <CheckCircle2 size={13} /> {sendStatus}
            </div>
          )}
          {sendError && <div className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{sendError}</div>}
        </div>
      )}
    </Modal>
  );
}
