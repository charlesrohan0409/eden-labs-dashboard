// Turning reconciled bank rows into ledger entries.
//
// One bank row becomes one two-leg transaction: the bank account on one
// side, whatever the money was on the other. The bank side is never in
// doubt — it comes straight off the statement and was reconciled against
// the bank's own running balance — so all the judgement sits in the second
// leg, which is exactly where the categorisation work went.
//
// TWO IDEAS DO THE HEAVY LIFTING HERE.
//
// 1. Family money is a LIABILITY, not an expense.
//
//    When your dad sends ₹50,000 for you to withdraw and hand over, you
//    are holding his money — you owe it back. So it credits a liability,
//    and handing the cash over debits the same liability. The pair nets to
//    zero on its own, and it never touches income or expense because a
//    liability isn't either of those. No flag required for correctness.
//
//    It also produces a genuinely useful number for free: whatever is left
//    in that account is family money you are still holding — or, if it
//    goes negative, money of your own you have fronted them.
//
// 2. Transfers between your own accounts go through a clearing account.
//
//    A transfer appears twice — a debit in one statement, a credit in the
//    other — and they are one event, not two. Both legs point at
//    `asset:transfers-in-transit`, so a matched pair nets to zero there.
//    Anything left in that account is a transfer whose other half is
//    missing from the statements, which is worth seeing rather than
//    silently absorbing.

import { entry, toMinor } from "./ledger.js";

export const BANK_ACCOUNT = {
  kotak: "asset:bank:kotak",
  hdfc: "asset:bank:hdfc",
  card: "liability:card:hdfc",
  overseas: "asset:overseas",
};

/**
 * Where the non-bank leg of each reconciled category points.
 *
 * `conduit: true` marks money that was never yours. Most of those already
 * land on a liability account and so are excluded from the P&L by their
 * kind alone — the flag is what lets the UI say "this wasn't your money"
 * without re-deriving that from the account tree.
 */
export const CATEGORY_ACCOUNT = {
  "Income: client":                   { account: "income:client",                 },
  "Interest earned":                  { account: "income:interest"                },
  "Loan received":                    { account: "liability:loan:idfc"            },
  // Repaying your own loan reduces the liability — it is not an expense.
  // Only the interest portion would be, and the statement does not split
  // it out, so this is recorded as principal until it does.
  "Loan repayment":                   { account: "liability:loan:idfc"            },

  "Family (not mine)":                { account: "liability:family",   conduit: true },
  "Cash: family (not mine)":          { account: "liability:family",   conduit: true },
  "Not my money (pass-through)":      { account: "liability:family",   conduit: true },

  "Transfer: my own accounts":        { account: "asset:transfers-in-transit"     },
  "Credit-card payment":              { account: "liability:card:hdfc"            },
  "Investments":                      { account: "asset:investments"              },

  "Business: software":               { account: "expense:business:software"      },
  "Business: other":                  { account: "expense:business:other"         },

  "Food: delivery & eating out":      { account: "expense:food:eating-out"        },
  "Food: groceries":                  { account: "expense:food:groceries"         },
  "Small local shops (assumed food)": { account: "expense:food:local"             },
  "Shopping":                         { account: "expense:shopping"               },
  "Travel":                           { account: "expense:travel"                 },
  "Health & pharmacy":                { account: "expense:health"                 },
  "Utilities & telecom":              { account: "expense:utilities"              },
  "Personal care & services":         { account: "expense:personal-care"          },
  "Personal: subscriptions":          { account: "expense:subscriptions"          },
  "Giving: church":                   { account: "expense:giving"                 },
  "Bank charges & fees":              { account: "expense:bank-charges"           },
  "BNPL repayment":                   { account: "expense:bnpl"                   },
  "Cash: personal":                   { account: "expense:cash"                   },
  "Partner":                          { account: "expense:partner"                },
  "Education (refunded)":             { account: "expense:education"              },
};

const FALLBACK = { account: "expense:uncategorised" };

/**
 * One reconciled bank row → one balanced transaction.
 *
 * A credit-card row is the exception worth knowing about: its "bank" side
 * is the card liability, and a purchase on the card INCREASES what you owe.
 * The sign handling below is the same in both cases only because the legs
 * are stored debit-positive throughout — a debit to the bank and a debit to
 * the card mean opposite things in plain English but identical things here,
 * which is precisely why the sign convention is worth keeping strict.
 */
export function rowToEntry(row) {
  const bank = BANK_ACCOUNT[row.account];
  if (!bank) return null;
  const map = CATEGORY_ACCOUNT[row.cat] || FALLBACK;
  const m = toMinor(row.amount);
  // DR on a statement means money left the asset (or debt rose on a card).
  const bankSide = row.dir === "DR" ? -m : m;
  return entry({
    date: row.date,
    memo: row.desc,
    kind: row.dir === "DR" ? "out" : "in",
    conduit: !!map.conduit,
    ref: { source: row.src, account: row.account, category: row.cat || null },
    legs: [
      { account: bank, amount: bankSide, currency: "INR", base: bankSide },
      { account: map.account, amount: -bankSide, currency: "INR", base: -bankSide },
    ],
  });
}

/**
 * Imports a batch, reporting what it could not place rather than guessing.
 *
 * Nothing is skipped silently: a row with no mapping still becomes a real
 * transaction against `expense:uncategorised`, so the ledger stays complete
 * and the gap is visible as a balance instead of a missing row.
 */
export function importRows(rows) {
  const ledger = [];
  const problems = [];
  let uncategorised = 0;
  for (const row of rows || []) {
    try {
      const tx = rowToEntry(row);
      if (!tx) { problems.push({ row, why: `unknown account "${row.account}"` }); continue; }
      if (!CATEGORY_ACCOUNT[row.cat]) uncategorised++;
      ledger.push(tx);
    } catch (e) {
      problems.push({ row, why: e.message });
    }
  }
  return { ledger, problems, uncategorised };
}
