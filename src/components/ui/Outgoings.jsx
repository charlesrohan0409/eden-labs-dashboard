import { useState } from "react";
import { Plus, Pencil, Trash2, Check, RotateCcw, Ban, Undo2 } from "lucide-react";
import Card from "./Card";
import Badge from "./Badge";
import PillTabs from "./PillTabs";
import ImagePicker from "./ImagePicker";
import BrandMark from "./BrandMark";
import CategorySelect from "./CategorySelect";
import { useCurrency } from "../../hooks/useCurrency";
import {
  OUTGOING_KIND_LIST, outgoingMeta, CADENCE_LIST, CADENCES,
  advanceDate, renewalLabel, bookOf, bookMeta, inBook, isCredit, outgoingFinished,
} from "../../lib/finance";
import { CURRENCIES } from "../../lib/currency";
import { today } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Subscriptions and fixed bills — everything that leaves on a schedule.
 *
 * Nothing charges itself. "Mark paid" is what books the expense, rolls the
 * renewal date forward and adjusts the linked account. See lib/finance.js for
 * why that's deliberate rather than unfinished.
 */
export default function Outgoings({ outgoings = [], accounts = [], categories = [], book = "all", onAddCategory, onAdd, onUpdate, onDelete, onCancel, onPay, onUndoPay, token }) {
  const { moneyFrom, convertFrom, currency, rate } = useCurrency();
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);

  // Book first, then the kind/status tabs below. The run-rate is computed
  // from `active`, so filtering here is what makes "what do my personal
  // subscriptions cost me a month" a number this card can actually answer.
  const scoped = inBook(outgoings, book);
  // A finite bill that has run its course is no longer a commitment: it must
  // drop out of the monthly run-rate and stop asking to be paid. Left in, an
  // EMI that finished last year would keep inflating "what I owe each month"
  // forever, which is the kind of quietly-wrong number that stops the whole
  // card being trusted.
  const active = scoped.filter((o) => o.status !== "cancelled" && !outgoingFinished(o));
  const visible = scoped
    .filter((o) => (filter === "all" ? o.status !== "cancelled" && !outgoingFinished(o)
                  : filter === "cancelled" ? o.status === "cancelled" || outgoingFinished(o)
                  : o.kind === filter && o.status !== "cancelled" && !outgoingFinished(o)))
    // Soonest first, and anything overdue floats to the top — the list is a
    // to-do, so what needs attention shouldn't sort below what doesn't.
    .sort((a, b) => (a.nextRenewal || "9999").localeCompare(b.nextRenewal || "9999"));

  // Monthly run-rate, normalised across cadences so a yearly plan doesn't
  // look twelve times scarier than it is.
  const monthlyOf = (list) => list.reduce((sum, o) => {
    const months = (CADENCES[o.cadence] || CADENCES.monthly).months;
    return sum + convertFrom(Number(o.amount) || 0, o.currency) / months;
  }, 0);

  const monthlyTotal = monthlyOf(active);
  // Per-kind, so each tab can carry its own number — "what do subscriptions
  // actually cost me" is a different question from the combined total, and
  // it was previously unanswerable without adding the rows up by hand.
  const byKind = Object.fromEntries(
    OUTGOING_KIND_LIST.map((k) => [k.id, monthlyOf(active.filter((o) => o.kind === k.id))])
  );
  // The headline follows the filter: pick Subscriptions and the big number
  // becomes what subscriptions cost.
  const headline = filter === "all" || filter === "cancelled" ? monthlyTotal : (byKind[filter] || 0);
  const headlineLabel = filter === "cancelled" ? "Cancelled"
    : filter === "all" ? `across ${active.length} active`
    : `${outgoingMeta(filter).plural.toLowerCase()} · ${active.filter((o) => o.kind === filter).length}`;

  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "";

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">Recurring</div>
          {active.length === 0 ? (
            <div className="text-xs text-stone-400 mt-1">
              Subscriptions and fixed bills — nothing charges automatically
            </div>
          ) : (
            <>
              <div className="text-[30px] leading-tight font-bold tracking-tight text-stone-900 tabular-nums mt-0.5">
                {moneyFrom(headline, currency)}
                <span className="text-sm font-medium text-stone-400 ml-1">/mo</span>
              </div>
              <div className="text-xs text-stone-400 mt-0.5">{headlineLabel}</div>
            </>
          )}
        </div>
        <button
          onClick={() => setEditing("new")}
          className={`flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200
            rounded-lg px-2.5 py-1.5 shrink-0 transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-100`}
        >
          <Plus size={13} /> Add
        </button>
      </div>

      <PillTabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: active.length },
          ...OUTGOING_KIND_LIST.map((k) => ({
            value: k.id,
            label: k.plural,
            count: active.filter((o) => o.kind === k.id).length,
          })),
          { value: "cancelled", label: "Cancelled" },
        ]}
      />

      <div className="space-y-1.5 mt-3">
        {visible.map((o, i) => {
          const meta = outgoingMeta(o.kind);
          const due = renewalLabel(o.nextRenewal);
          // A finished bill reads the same as a cancelled one — done, kept
          // for history, not asking for anything.
          const cancelled = o.status === "cancelled" || outgoingFinished(o);
          return (
            <div
              key={o.id}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              className={`group flex items-center gap-2.5 rounded-xl border p-2.5
                motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                transition-colors duration-200 ${EASE}
                ${cancelled ? "border-line opacity-50" : due.overdue ? "border-rose-200 bg-rose-50/40" : "border-line hover:border-stone-300"}`}
            >
              <BrandMark
                name={o.name}
                logoUrl={o.logoUrl}
                website={o.website}
                size={30}
                tone={meta.chip}
              />

              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-medium truncate flex items-center gap-1.5 ${cancelled ? "text-stone-400 line-through" : "text-stone-800"}`}>
                  {o.name}
                  {/* Business is the default and the majority, so only the
                      exception is badged — tagging both would put a chip on
                      every row and stop it carrying information. */}
                  {bookOf(o) === "personal" && (
                    <span className={`text-[9.5px] font-medium rounded-full px-1.5 py-px ring-1 shrink-0 ${bookMeta("personal").chip}`}>
                      Personal
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-stone-400 truncate">
                  {CADENCES[o.cadence]?.label}
                  {/* For a card bill the destination matters more than the
                      category — it's a transfer, and seeing where it lands
                      is what makes the two balance movements explainable. */}
                  {o.paysDownAccountId
                    ? ` · ${accountName(o.accountId) || "?"} → ${accountName(o.paysDownAccountId) || "card"}`
                    : (o.category ? ` · ${o.category}` : "")}
                  {!o.paysDownAccountId && o.accountId && accountName(o.accountId) && ` · ${accountName(o.accountId)}`}
                  {o.endsOn && ` · ends ${o.endsOn}`}
                </div>
              </div>

              {!cancelled && o.nextRenewal && (
                <Badge tone={due.tone}>{due.text}</Badge>
              )}

              <div className="text-[13px] font-semibold text-stone-700 tabular-nums shrink-0">
                {moneyFrom(o.amount, o.currency)}
              </div>

              <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                {/* Shown whenever a payment is reversible — not on a timer.
                    An accidental tick is often noticed when the balance is
                    next looked at, which can be days later, and an undo that
                    expired before you spotted the mistake is no undo. */}
                {o.lastPayment && (
                  <button
                    onClick={() => onUndoPay?.(o.id)}
                    aria-label="Undo last payment"
                    title={`Undo — puts back ${moneyFrom(o.lastPayment.amount, o.currency)}`}
                    className={`p-1.5 rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-50
                      transition-transform duration-150 ${EASE} active:scale-[0.92]`}
                  >
                    <Undo2 size={13} />
                  </button>
                )}
                {!cancelled && (
                  <button
                    onClick={() => {
                      // A card statement differs every month, so it is asked
                      // for rather than assumed. Everything else is a fixed
                      // recurring figure and is paid without a prompt.
                      let amount;
                      if (o.paysDownAccountId) {
                        const typed = window.prompt(
                          `How much are you paying off ${accountName(o.paysDownAccountId) || "the card"}?`,
                          String(o.amount ?? "")
                        );
                        if (typed === null) return;
                        amount = Number(typed);
                        if (!Number.isFinite(amount) || amount <= 0) return;
                      }
                      onPay?.(o.id, {
                        date: today(),
                        amount,
                        rate,
                        nextRenewal: o.nextRenewal ? advanceDate(o.nextRenewal, o.cadence) : "",
                      });
                    }}
                    aria-label="Mark paid"
                    title={o.paysDownAccountId
                      ? "Mark paid — moves money from the bank and reduces the card debt"
                      : "Mark paid — logs the expense and moves the date forward"}
                    className={`p-1.5 rounded-lg text-stone-300 hover:text-emerald-700 hover:bg-emerald-50
                      transition-transform duration-150 ${EASE} active:scale-[0.92]`}
                  >
                    <Check size={13} />
                  </button>
                )}
                <button onClick={() => setEditing(o.id)} aria-label="Edit"
                  className="p-1.5 rounded-lg text-stone-300 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                  <Pencil size={12} />
                </button>
                <button onClick={() => onCancel?.(o.id)} aria-label={cancelled ? "Reactivate" : "Cancel"}
                  title={cancelled ? "Reactivate" : "Cancel — keeps the history"}
                  className="p-1.5 rounded-lg text-stone-300 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                  {cancelled ? <RotateCcw size={12} /> : <Ban size={12} />}
                </button>
                <button onClick={() => onDelete?.(o.id)} aria-label="Delete"
                  className="p-1.5 rounded-lg text-stone-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="text-xs text-stone-300 py-6 text-center">
            {filter === "cancelled" ? "Nothing cancelled." : "Nothing here yet."}
          </div>
        )}
      </div>

      {/* key={editing} is load-bearing, not decoration. The list stays
          clickable while this form is open, so `editing` can go straight from
          one row's id to another's. Same component, same position, so React
          reuses the instance and the useState initialisers below never re-run
          — the form kept showing the FIRST row's values while saving onto the
          SECOND row's id. Silent overwrite of the wrong record. The key forces
          a remount whenever the target changes. */}
      {editing && (
        <OutgoingForm
          key={editing}
          outgoing={editing === "new" ? null : outgoings.find((o) => o.id === editing)}
          accounts={accounts}
          categories={categories}
          onAddCategory={onAddCategory}
          token={token}
          defaultBook={book === "all" ? "business" : book}
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

function OutgoingForm({ outgoing, accounts, categories, onAddCategory, onSave, onCancel, token, defaultBook = "business" }) {
  const [form, setForm] = useState({
    name: outgoing?.name || "",
    kind: outgoing?.kind || "subscription",
    // Inherits the page's current book so adding a subscription while
    // looking at Personal doesn't file it against the agency.
    book: outgoing ? bookOf(outgoing) : defaultBook,
    amount: outgoing?.amount ?? "",
    currency: outgoing?.currency || "INR",
    cadence: outgoing?.cadence || "monthly",
    nextRenewal: outgoing?.nextRenewal || "",
    category: outgoing?.category || "Software",
    accountId: outgoing?.accountId || "",
    // The card this bill pays DOWN. Set only for a card bill; its presence
    // is what tells payOutgoing to treat the payment as a transfer rather
    // than booking a duplicate expense.
    paysDownAccountId: outgoing?.paysDownAccountId || "",
    // Optional last date for a finite bill — an EMI, a fixed-term plan.
    endsOn: outgoing?.endsOn || "",
    website: outgoing?.website || "",
    logoUrl: outgoing?.logoUrl || "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const input = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const label = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1";

  return (
    <div className="mt-4 pt-4 border-t border-line motion-safe:animate-fade-up">
      <div className="flex items-start gap-3 mb-3">
        <BrandMark name={form.name} logoUrl={form.logoUrl} website={form.website} size={44} />
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-2.5">
          <div>
            <label className={label}>Name</label>
            <input className={input} value={form.name} onChange={set("name")} placeholder="e.g. Adobe, Electricity" autoFocus />
          </div>
          <div>
            <label className={label}>Website (for logo)</label>
            <input className={input} value={form.website} onChange={set("website")} placeholder="adobe.com" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div>
          <label className={label}>Book</label>
          <select className={input} value={form.book} onChange={set("book")}>
            <option value="business">Eden Labs</option>
            <option value="personal">Personal</option>
          </select>
        </div>
        <div>
          <label className={label}>Kind</label>
          <select className={input} value={form.kind} onChange={set("kind")}>
            {OUTGOING_KIND_LIST.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <CategorySelect
          label="Category"
          value={form.category}
          onChange={(v) => setForm((f) => ({ ...f, category: v }))}
          categories={categories}
          onAddCategory={onAddCategory}
        />
        <div>
          <label className={label}>Amount</label>
          <input className={input} type="number" value={form.amount} onChange={set("amount")} placeholder="0" />
        </div>
        <div>
          <label className={label}>Currency</label>
          <select className={input} value={form.currency} onChange={set("currency")}>
            {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Repeats</label>
          <select className={input} value={form.cadence} onChange={set("cadence")}>
            {CADENCE_LIST.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Next renewal</label>
          <input className={input} type="date" value={form.nextRenewal} onChange={set("nextRenewal")} />
        </div>
        <div className={form.kind === "card" ? "" : "col-span-2"}>
          <label className={label}>Paid from</label>
          <select className={input} value={form.accountId} onChange={set("accountId")}>
            <option value="">Not linked to an account</option>
            {/* A card can't fund its own bill. Excluding cards here is what
                stops the nonsense case of paying a card off with itself,
                which would move the debt in a circle. */}
            {accounts.filter((a) => !isCredit(a)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Only for a card bill. Setting this is what makes the payment a
            TRANSFER — bank down, card debt down, and no expense booked,
            because the purchases behind the balance were already expensed
            when they happened. Without it the same spending is counted
            twice: once as the purchase, again as the statement. */}
        {form.kind === "card" && (
          <div>
            <label className={label}>Pays down</label>
            <select className={input} value={form.paysDownAccountId} onChange={set("paysDownAccountId")}>
              <option value="">Pick the card</option>
              {accounts.filter(isCredit).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div className="col-span-2">
          <label className={label}>Runs until (optional)</label>
          {/* For a finite commitment — an EMI, a fixed-term plan. Left blank
              it recurs indefinitely, which is right for a subscription. */}
          <input className={input} type="date" value={form.endsOn} onChange={set("endsOn")} min={form.nextRenewal} />
        </div>
      </div>
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
          onClick={() => onSave({ ...form, amount: Number(form.amount) || 0, accountId: form.accountId || null })}
          disabled={!form.name.trim()}
          className={`text-xs font-medium bg-emerald-800 text-white rounded-lg px-3 py-1.5
            transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-900 disabled:opacity-40`}
        >
          {outgoing ? "Save" : "Add"}
        </button>
        <button onClick={onCancel} className="text-xs text-stone-500 px-3 py-1.5 hover:text-stone-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
