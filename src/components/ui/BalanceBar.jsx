import { useState } from "react";
import { Eye, EyeOff, Plus, Pencil, Trash2, CreditCard, Wallet } from "lucide-react";
import Card from "./Card";
import ImagePicker from "./ImagePicker";
import BrandMark from "./BrandMark";
import { useCurrency } from "../../hooks/useCurrency";
import { ACCOUNT_TYPE_LIST, accountMeta, isCredit } from "../../lib/finance";
import { CURRENCIES } from "../../lib/currency";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Balances, split hard down the middle: what you HAVE and what you OWE.
 *
 * Those were previously one undifferentiated grid, which is the wrong shape
 * for the question being asked. Cash and debt aren't two flavours of the same
 * number — one goes up when things go well and the other goes down — and
 * mixing them means the eye has to check each card's colour to work out which
 * direction is good. Two labelled groups with their own subtotals, and a net
 * figure on top, answers "how am I doing" without any per-card arithmetic.
 *
 * Balances start HIDDEN on every load and reveal only for the current mount,
 * deliberately not persisted like the global "hide amounts" setting: the
 * reason to hide a bank balance is that someone might be looking at the
 * screen, and that risk resets every time the page opens.
 */
export default function BalanceBar({ accounts = [], onAdd, onUpdate, onDelete, token }) {
  const { moneyFrom, convertFrom, currency, hideAmounts } = useCurrency();
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(null);

  const show = revealed && !hideAmounts;
  const fmt = (n, from) => (show ? moneyFrom(n, from) : "••••••");

  const cash = accounts.filter((a) => !isCredit(a));
  const cards = accounts.filter(isCredit);

  const inDisplay = (a) => convertFrom(Number(a.balance) || 0, a.currency);
  const cashTotal = cash.reduce((s, a) => s + inDisplay(a), 0);
  const debtTotal = cards.reduce((s, a) => s + Math.abs(inDisplay(a)), 0);
  const net = cashTotal - debtTotal;

  return (
    <Card className="p-4 sm:p-5">
      {/* ── Net worth, and the two halves it's made of ── */}
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">Net worth</span>
            <button
              onClick={() => setRevealed((v) => !v)}
              aria-label={show ? "Hide balances" : "Show balances"}
              title={hideAmounts ? "Amounts are hidden app-wide — turn that off first" : undefined}
              disabled={hideAmounts}
              className={`p-1 rounded-md text-stone-400 transition-transform duration-150 ${EASE}
                active:scale-[0.92] disabled:opacity-40 disabled:cursor-not-allowed
                hover:bg-stone-100 hover:text-stone-700`}
            >
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <div className={`text-[30px] leading-tight font-bold tracking-tight tabular-nums mt-0.5 ${
            net < 0 ? "text-rose-700" : "text-stone-900"
          }`}>
            {fmt(net, currency)}
          </div>
          {accounts.length > 0 && (
            <div className="text-xs text-stone-400 mt-1">
              {fmt(cashTotal, currency)} cash
              {debtTotal > 0 && <> · <span className="text-rose-500">{fmt(debtTotal, currency)} owed</span></>}
            </div>
          )}
        </div>
        <button
          onClick={() => setEditing("new")}
          className={`flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200
            rounded-lg px-2.5 py-1.5 shrink-0 transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-100`}
        >
          <Plus size={13} /> Account
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="text-xs text-stone-300 py-6 text-center">
          Add your accounts and cards to see everything in one place.
        </div>
      )}

      <Section
        title="Cash"
        icon={Wallet}
        total={cash.length ? fmt(cashTotal, currency) : null}
        items={cash}
        show={show}
        fmt={fmt}
        currency={currency}
        onEdit={setEditing}
        onDelete={onDelete}
      />

      <Section
        title="Credit"
        icon={CreditCard}
        // Debt reads as a negative here so the sign matches its effect on the
        // number above it — a card showing "₹18,500" next to "cash ₹50,000"
        // invites adding them together.
        total={cards.length ? `−${fmt(debtTotal, currency).replace("−", "")}` : null}
        totalTone="text-rose-600"
        items={cards}
        show={show}
        fmt={fmt}
        currency={currency}
        onEdit={setEditing}
        onDelete={onDelete}
        credit
      />

      {editing && (
        <AccountForm
          account={editing === "new" ? null : accounts.find((a) => a.id === editing)}
          token={token}
          onCancel={() => setEditing(null)}
          onSave={(patch) => {
            if (editing === "new") onAdd?.(patch);
            else onUpdate?.(editing, patch);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function Section({ title, icon: Icon, total, totalTone = "text-stone-700", items, show, fmt, currency, onEdit, onDelete, credit = false }) {
  if (!items.length) return null;
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={12} className="text-stone-400" />
        <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">{title}</span>
        <span className="h-px flex-1 bg-line" />
        {total && <span className={`text-[12px] font-semibold tabular-nums ${totalTone}`}>{total}</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {items.map((a, i) => {
          const meta = accountMeta(a.type);
          const owed = Math.abs(Number(a.balance) || 0);
          const utilisation = credit && Number(a.limit) > 0
            ? Math.min(100, (owed / Number(a.limit)) * 100)
            : null;
          return (
            <div
              key={a.id}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              className={`group relative rounded-xl border p-3 bg-white
                motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                transition-colors duration-200 ${EASE}
                ${credit ? "border-rose-100 hover:border-rose-200" : "border-line hover:border-stone-300"}`}
            >
              <div className="flex items-center gap-2 mb-2.5">
                <BrandMark
                  name={a.name || meta.label}
                  logoUrl={a.logoUrl}
                  website={a.website}
                  size={26}
                  tone={credit ? "bg-rose-50 text-rose-600" : meta.chip}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium text-stone-700 truncate">{a.name || meta.label}</span>
                  <span className="block text-[10px] text-stone-400 truncate">{meta.label}</span>
                </span>
              </div>

              <div className={`text-[17px] font-semibold tabular-nums tracking-tight ${credit ? "text-rose-700" : "text-stone-900"}`}>
                {credit && show ? "−" : ""}{fmt(owed || a.balance, a.currency)}
              </div>

              {/* Its own currency, when that differs from what's on screen —
                  otherwise a converted figure is indistinguishable from a
                  native one. */}
              {a.currency !== currency && show && (
                <div className="text-[10px] text-stone-400 mt-0.5">
                  {CURRENCIES[a.currency]?.symbol}{Number(a.balance).toLocaleString()} {a.currency}
                </div>
              )}

              {utilisation !== null && show && (
                <div className="mt-2">
                  <div className="h-1 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className={`h-full w-full rounded-full origin-left transition-transform duration-300 ${EASE}
                        ${utilisation >= 80 ? "bg-rose-500" : utilisation >= 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ transform: `scaleX(${utilisation / 100})` }}
                    />
                  </div>
                  <div className="text-[10px] text-stone-400 mt-1">
                    {Math.round(utilisation)}% of {fmt(a.limit, a.currency)} limit
                  </div>
                </div>
              )}

              {(a.billDate || a.dueDate) && (
                <div className="text-[10px] text-stone-400 mt-1.5">
                  {a.billDate && <>Bills {a.billDate}</>}
                  {a.billDate && a.dueDate && " · "}
                  {a.dueDate && <>Due {a.dueDate}</>}
                </div>
              )}

              <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                <button onClick={() => onEdit(a.id)} aria-label="Edit account"
                  className="p-1 rounded-md text-stone-300 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                  <Pencil size={11} />
                </button>
                <button onClick={() => onDelete?.(a.id)} aria-label="Delete account"
                  className="p-1 rounded-md text-stone-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountForm({ account, onSave, onCancel, token }) {
  const [form, setForm] = useState({
    name: account?.name || "",
    type: account?.type || "main",
    balance: account?.balance ?? "",
    currency: account?.currency || "INR",
    limit: account?.limit ?? "",
    billDate: account?.billDate || "",
    dueDate: account?.dueDate || "",
    website: account?.website || "",
    logoUrl: account?.logoUrl || "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const credit = accountMeta(form.type).kind === "credit";
  const input = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const label = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1";

  return (
    <div className="mt-4 pt-4 border-t border-line motion-safe:animate-fade-up">
      <div className="flex items-start gap-3 mb-3">
        <BrandMark name={form.name} logoUrl={form.logoUrl} website={form.website} size={44} />
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-2.5">
          <div>
            <label className={label}>Name</label>
            <input className={input} value={form.name} onChange={set("name")} placeholder="e.g. HDFC Main" autoFocus />
          </div>
          <div>
            <label className={label}>Website (for logo)</label>
            <input className={input} value={form.website} onChange={set("website")} placeholder="hdfcbank.com" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div>
          <label className={label}>Type</label>
          <select className={input} value={form.type} onChange={set("type")}>
            {ACCOUNT_TYPE_LIST.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{credit ? "Owed" : "Balance"}</label>
          <input className={input} type="number" value={form.balance} onChange={set("balance")} placeholder="0" />
        </div>
        <div>
          <label className={label}>Currency</label>
          <select className={input} value={form.currency} onChange={set("currency")}>
            {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        {credit && (
          <>
            <div>
              <label className={label}>Credit limit</label>
              <input className={input} type="number" value={form.limit} onChange={set("limit")} placeholder="0" />
            </div>
            <div>
              <label className={label}>Bill date</label>
              <input className={input} type="date" value={form.billDate} onChange={set("billDate")} />
            </div>
            <div>
              <label className={label}>Payment due</label>
              <input className={input} type="date" value={form.dueDate} onChange={set("dueDate")} />
            </div>
          </>
        )}
      </div>

      {/* Upload overrides the favicon — for banks whose site has no usable
          icon, or anything you'd rather not resolve through a third party. */}
      <div className="mt-3">
        <ImagePicker
          label="Custom logo (optional)"
          hint="Overrides the website icon"
          value={form.logoUrl}
          onChange={(url) => setForm((f) => ({ ...f, logoUrl: url }))}
          size={40}
          token={token}
        />
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ ...form, balance: Number(form.balance) || 0, limit: Number(form.limit) || 0 })}
          disabled={!form.name.trim()}
          className={`text-xs font-medium bg-emerald-800 text-white rounded-lg px-3 py-1.5
            transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-900 disabled:opacity-40`}
        >
          {account ? "Save" : "Add account"}
        </button>
        <button onClick={onCancel} className="text-xs text-stone-500 px-3 py-1.5 hover:text-stone-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
