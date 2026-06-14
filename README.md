# AgenticaTrade — Daily X Content Agent

A human-in-the-loop assistant that drafts daily X/Twitter posts for the
[AgenticaTrade](https://agentica.trade) account, lays them out on a calendar to
review, and **only publishes posts you approved in advance**. No build step, no
dependencies — just open it in a browser.

> AgenticaTrade runs AI agents that trade tokenized real-world assets (RWA). The
> goal of this content is to **grow followers and drive engagement** with
> followers and potential users.

## What it does

1. **Generates draft posts daily** based on
   - each account's own topics/niche (e.g. AgenticaTrade → RWA tokens, crypto,
     trading, equities like TSLA/NVDA, commodities like oil/gold), and
   - trending events relevant to those topics.
   Copy is written in engagement-driving styles (hot takes, questions, data
   hooks, contrarian angles) with a follow CTA and topical hashtags, trimmed to
   X's 280-character limit.

2. **Calendar review.** A 7-day calendar shows upcoming drafts in their
   scheduled time slots. For each draft you can **Approve**, **Edit** (text and
   schedule), **Regenerate**, or **Reject**.

3. **Approval-gated publishing.** A scheduler checks posts whose scheduled time
   has arrived:
   - **Approved** → publishes (the *only* path to "Published").
   - **Not approved** (still a draft) → marked **Missed**; it is **never
     posted**, even though it was due.

   This gate is enforced in `publishPost()`, which refuses to publish anything
   not in the `approved` state.

## Multiple accounts

The app is multi-account. Each account carries its **own topics and signature
tags**, and posts are scoped to an account (`accountId` on every post):

- Switch accounts with the tabs under the header — the calendar and stats are
  scoped to the active account.
- **＋ Add account** opens a form (display name, handle, niche, topics, tags).
  Generation immediately drafts a week for the new account using its topics and
  appends its tags. PublicAI ships as a second account out of the box.
- The approval-gated scheduler is **time-based and runs across all accounts**,
  so each account's approved posts publish at their own scheduled times.

This scales without a separate platform. For production publishing across many
accounts you'd add per-account X OAuth tokens and move the scheduler
server-side (see notes below) — the generation, calendar, and approval gate are
already account-agnostic.

## Post lifecycle

```
            approve                 due + approved
  draft ─────────────▶ approved ───────────────────▶ published
    │  ▲                  │
    │  │ unapprove / edit │
    │  └──────────────────┘
    │
    │ due + NOT approved
    └────────────────────▶ missed        (never posts)
    │
    │ reject
    └────────────────────▶ rejected      (restore → draft)
```

**Safety rules**

- Editing an approved (or missed) post sends it back to **Draft** — it must be
  re-approved, so you never publish content you didn't sign off on.
- A draft can't be approved after its slot has already passed; reschedule it
  first.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

On first load it seeds the current week with drafts. Use **Generate drafts** to
add more, the **＋** on any day to add one, and **Run scheduler** to process due
posts immediately (otherwise it auto-checks every 15 seconds).

Drafts and decisions persist in your browser via `localStorage`.

## Files

- `index.html` — app shell: header, stat bar, calendar, footer
- `styles.css` — dark, trading-platform styling
- `app.js` — account profile, trend pool, copy generation, calendar rendering,
  approval actions, and the approval-gated scheduler

## Notes / going to production

This is a self-contained demo. Publishing to X is **simulated**. To go live:

- Replace the body of `publishPost()` with a real X API call (keep the
  `status === "approved"` guard).
- Swap the static `TREND_POOL` for a live trends/news feed.
- Move generation + scheduling to a backend (cron/worker) so posts publish even
  when the browser tab is closed, and store state in a database instead of
  `localStorage`.
