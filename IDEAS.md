# Things we could add next

Written 27 Aug 2026. Plain list, roughly in the order I'd do them.
Nothing here is started. Each one says what it does, why it's worth it,
and roughly how big a job it is.

---

## 1. Finish what's half-built

These are gaps I hit while fixing bugs. They're small and they close
loops that are already open.

### Pull Buffer posts back into your board
**Small job.**
Right now the calendar shows posts you scheduled inside Buffer's own app,
but they're marked "not in your board" because the dashboard has no card
for them. And if you change a post's time in Buffer, your board still
shows the old time.

Add a "sync from Buffer" button that creates a card for anything missing
and corrects times that have drifted. One button, one confirmation, no
surprises.

### Show invoices in the client portal
**Small job.**
Clients can see their contract value but not a single invoice. They can't
tell what's been billed or what's been paid. Adding a simple list — date,
amount, paid or not — makes the portal feel like a real account page
instead of a progress report.

### Load meeting transcripts automatically
**Very small job.**
The portal makes clients press "Load meetings" before anything appears.
Nobody presses a button on a page they've just opened. Load it on arrival.

### Let clients reply to your comments
**Small job.**
Comments work one way at a time — you both post into the same thread but
there's no sense of a conversation. Threading replies would make the
portal usable for actual back-and-forth instead of email.

---

## 2. Make your own week easier

This is where I think the most value is. The dashboard currently records
what you did. It doesn't help you decide what to do.

### A Monday review screen
**Medium job. My top pick.**
One page you open once a week that answers: what went out, what landed,
what slipped, who's gone quiet, what's due this week. All the data already
exists — it's just scattered across six tabs right now.

This is the difference between a system you check and a system that tells
you things.

### Nudges instead of you remembering
**Medium job.**
Nothing in the app ever tells you anything. You have to open it and look.
A few well-chosen nudges would change that:
- an invoice is two weeks late
- a client hasn't had a post in three weeks
- someone messaged you five days ago and you never replied
- a contract renews in ten days

Email is probably enough to start. No need for anything fancy.

### Search everything from one box
**Small-to-medium job.**
There's already a command palette (Cmd-K). Right now it jumps between
pages. If it also searched clients, posts, invoices, leads and notes, it
would become the fastest way to use the whole app.

### Where your time actually goes
**Medium job.**
You have tasks with categories already. If tasks could hold rough hours,
you'd learn which clients cost you the most time versus what they pay.
That's the number that tells you who to raise prices on — or drop.

---

## 3. Winning and keeping clients

### Monthly client report, generated for you
**Medium job. Probably the biggest client-facing win.**
Once a month, produce a clean one-page summary per client — what went out,
how it performed, what's next — that you can send or that just appears in
their portal.

Agencies charge for this. You already hold every number it needs. Right
now the only way a client sees their progress is by logging in.

### Proposals and quotes
**Medium job.**
You have contracts. You don't have the thing that comes before a contract.
A simple proposal builder — pick a service, set a price, send a link —
would close the gap between "inbound enquiry" and "client".

It also fits the CRM you already built. An enquiry becomes a lead, a lead
gets a proposal, a proposal becomes a client.

### Warn me before a client leaves
**Small job.**
You already calculate a health score. Nothing acts on it. If a client's
score drops for two weeks running, or their contract is near renewal while
their score is low, that should be sitting on your dashboard — not
something you notice afterwards.

### Onboarding checklist per client type
**Small job.**
When you add a client you get the same starter tasks every time. Different
service types need different setups. Letting you save a checklist per type
would save you rebuilding it by hand each time.

---

## 4. Bigger bets

Worth considering, but I'd want to talk them through before building.

### Let clients ask for things
Right now clients can approve posts and comment. They can't say "can we do
a post about X" or "can we move this week's call". A simple request box
would cut down on WhatsApp messages that then need copying into the app.

### Multi-user access
There's already an unused `team_members` table sitting in the database
from an earlier attempt. If you ever bring on a VA or a writer, this is
what they'd log into. Not urgent while it's just you, but it's the thing
that unblocks hiring.

### Split the database up
Everything lives in one big JSON record. It works fine now. If it ever
gets slow, or two people start editing at once, the fast-growing bits
(expenses, activity log, outreach) would move to proper tables first.

Not urgent. Worth knowing it's the ceiling.

---

## Things I'd deliberately not build

- **AI writing the posts for you.** You already have a repurposing flow
  that hands you a starting point. Auto-generated posts read as
  auto-generated, and your whole offer is that they don't.
- **More charts.** The app has plenty. The gap isn't seeing numbers, it's
  being told when a number matters.
- **A mobile app.** The site works on a phone. A separate app is a lot of
  work for very little that you can't already do.
