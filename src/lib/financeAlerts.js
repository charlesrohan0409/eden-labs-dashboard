// Things worth being told, rather than things you have to go and look for.
//
// Every number this produces already existed somewhere in the dashboard. The
// problem was that all of them required opening the right tab on the right
// day: a budget breach was visible only inside Budgets, a shortfall only if
// you did the arithmetic yourself, a bill due tomorrow only if you scrolled
// the outgoings list. A warning that depends on you already suspecting it is
// not a warning.
//
// Pure and side-effect free, so the same function feeds the in-app banner and
// the emailed digest and they can never disagree about what's wrong.

import { spentOn, budgetWindow, budgetNotStarted, bookOf } from "./finance.js";
import { projectRunway } from "./runway.js";
import { budgetExpenses } from "./financeSync.js";

const inr = (n) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
// A balance can legitimately be below zero, and Math.abs above would report
// "bottoming at ₹5,715" for a −₹5,715 overdraft — the one number in the
// sentence that has to carry its sign.
const signed = (n) => (n < 0 ? "−" : "") + inr(n);
const iso = (d) => d.toISOString().slice(0, 10);

export const SEVERITY = { critical: 3, warning: 2, info: 1 };

/**
 * Everything currently worth saying, worst first.
 *
 * `now` is injectable so the digest can be generated for a specific morning
 * and so tests aren't hostage to the clock.
 */
export function financeAlerts(data, ledgerEntries, { now = new Date(), dueWithinDays = 7 } = {}) {
  if (!data) return [];
  const alerts = [];
  const today = iso(now);
  const add = (a) => alerts.push(a);

  // ---- budgets -----------------------------------------------------------
  const rows = budgetExpenses(data, ledgerEntries, data.expenseCategories);
  for (const b of data.budgets || []) {
    const limit = Number(b.limit) || 0;
    if (!limit) continue;
    if (budgetNotStarted(b, now)) continue;
    const win = budgetWindow(b, now);
    if (win.invalid) continue;
    const spent = spentOn(b, rows, (a) => a, now);
    const pct = spent / limit;
    if (pct < 0.8) continue;
    const over = spent - limit;
    add({
      id: `budget:${b.id}:${win.from || ""}`,
      severity: over > 0 ? "critical" : "warning",
      kind: "budget",
      title: over > 0
        ? `${b.category} is over budget by ${inr(over)}`
        : `${b.category} is at ${Math.round(pct * 100)}% of its limit`,
      detail: `${inr(spent)} spent of ${inr(limit)}${win.to ? `, window ends ${win.to}` : ""} · ${bookOf(b)} book`,
      value: spent,
    });
  }

  // ---- can you cover what's coming ---------------------------------------
  const runway = projectRunway({
    accounts: data.accounts, outgoings: data.outgoings, loans: data.loans,
    days: 45, from: now,
  });
  if (runway.shortfall > 0) {
    add({
      id: `runway:${runway.shortfallAt.date}`,
      severity: "critical",
      kind: "runway",
      title: `You're ${inr(runway.shortfall)} short of covering scheduled bills`,
      detail: `Balance first goes under on ${runway.shortfallAt.date}, bottoming at ${signed(runway.low.balance)} on ${runway.low.date}. Spendable now: ${inr(runway.opening)}.`,
      value: runway.shortfall,
    });
  } else if (runway.low.balance < runway.opening * 0.15) {
    // Not short, but thin enough that one unplanned expense would do it.
    add({
      id: `runway-thin:${runway.low.date}`,
      severity: "warning",
      kind: "runway",
      title: `Cash gets tight around ${runway.low.date}`,
      detail: `Down to ${signed(runway.low.balance)} at the low point, from ${inr(runway.opening)} today.`,
      value: runway.low.balance,
    });
  }

  // ---- bills about to be taken -------------------------------------------
  const soon = new Date(now);
  soon.setDate(soon.getDate() + dueWithinDays);
  const due = (data.outgoings || [])
    .filter((o) => (!o.status || o.status === "active") && o.nextRenewal)
    .filter((o) => o.nextRenewal >= today && o.nextRenewal <= iso(soon))
    .sort((a, b) => (a.nextRenewal < b.nextRenewal ? -1 : 1));
  if (due.length) {
    const total = due.reduce((s, o) => s + (Number(o.lastPaidAmount ?? o.amount) || 0), 0);
    add({
      id: `due:${today}`,
      severity: "info",
      kind: "due",
      title: `${due.length} payment${due.length === 1 ? "" : "s"} due in the next ${dueWithinDays} days — ${inr(total)}`,
      detail: due.map((o) => `${o.name} ${inr(Number(o.lastPaidAmount ?? o.amount) || 0)} on ${o.nextRenewal}`).join(" · "),
      value: total,
    });
  }

  // ---- money owed to you that's now due ----------------------------------
  for (const l of data.loans || []) {
    if (l.status && l.status !== "outstanding") continue;
    if (!l.dueDate || l.dueDate > today) continue;
    add({
      id: `loan-due:${l.id}`,
      severity: "warning",
      kind: "receivable",
      title: `${l.person || "Someone"} owes you ${inr(l.amount)} — due ${l.dueDate}`,
      detail: l.reason || "Past its repayment date.",
      value: Number(l.amount) || 0,
    });
  }

  // ---- spending the books can't explain ----------------------------------
  const unc = (ledgerEntries || []).filter((t) =>
    (t.legs || []).some((l) => /uncategor/i.test(l.account || ""))
  );
  if (unc.length >= 25) {
    const total = unc.reduce((s, t) => {
      const leg = t.legs.find((l) => /uncategor/i.test(l.account));
      return s + Math.abs(Number(leg?.base) || 0) / 100;
    }, 0);
    add({
      id: `uncategorised:${unc.length}`,
      severity: "info",
      kind: "uncategorised",
      title: `${unc.length} transactions worth ${inr(total)} are uncategorised`,
      detail: "They count towards totals but belong to no category, so no budget can see them.",
      value: total,
    });
  }

  return alerts.sort((a, b) => (SEVERITY[b.severity] - SEVERITY[a.severity]) || (b.value || 0) - (a.value || 0));
}

/** The digest email, when there is anything worth sending. */
export function alertsEmail(alerts, { name = "Charles" } = {}) {
  if (!alerts.length) return null;
  const worst = alerts[0];
  const tone = { critical: "#A93520", warning: "#8A5A0B", info: "#0E6B60" };
  const rows = alerts.map((a) => `
    <tr>
      <td style="padding:14px 16px;border-left:3px solid ${tone[a.severity]};background:#fff;">
        <div style="font:600 15px/1.35 -apple-system,Segoe UI,sans-serif;color:#12181B;">${escapeHtml(a.title)}</div>
        <div style="font:400 13.5px/1.5 -apple-system,Segoe UI,sans-serif;color:#5C6673;margin-top:4px;">${escapeHtml(a.detail)}</div>
      </td>
    </tr>
    <tr><td style="height:8px;"></td></tr>`).join("");

  return {
    subject: alerts.some((a) => a.severity === "critical")
      ? `Needs attention: ${worst.title}`
      : `Your money this week — ${alerts.length} thing${alerts.length === 1 ? "" : "s"} to know`,
    html: `<div style="background:#F5F7F7;padding:28px 16px;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="font:500 22px/1.2 Georgia,serif;color:#12181B;margin-bottom:6px;">Hello ${escapeHtml(name)},</div>
        <div style="font:400 14px/1.5 -apple-system,Segoe UI,sans-serif;color:#5C6673;margin-bottom:18px;">
          ${alerts.length} thing${alerts.length === 1 ? "" : "s"} from your dashboard.
        </div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;">${rows}</table>
        <div style="font:400 12px/1.5 -apple-system,Segoe UI,sans-serif;color:#6B787E;margin-top:18px;">
          Sent because something crossed a threshold you set. Nothing here changes anything on its own.
        </div>
      </div>
    </div>`,
    text: alerts.map((a) => `- ${a.title}\n  ${a.detail}`).join("\n\n"),
  };
}

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
