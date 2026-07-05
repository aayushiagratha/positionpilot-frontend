# PositionPilot — Architecture

Last reviewed: 2026-07-06.

## What it is

PositionPilot takes 9 form fields about a company and generates a full GTM
strategy — positioning, ICP, messaging, GTM plan, and SEO — through a
three-stage pipeline. The user reviews and edits the AI-drafted foundation
(positioning + ICP) before the rest of the strategy is generated from it.

## High-level flow

```
Browser (TanStack Start)
   │
   │ 1. Submit 9-field form
   ▼
Server function → n8n webhook "stage1"  (OpenRouter / DeepSeek)
   │  returns positioning_output + icp_output (drafted foundation)
   ▼
Review screen (editable: edit / add / delete / AI-rewrite per field)
   │
   │ 2. Approve — send edited foundation + generation_run_id
   ▼
Server function → n8n webhook "approve"
   │  Postgres: output = output || edited_patch  (jsonb merge,
   │  preserves fields the user didn't touch), status = 'approved'
   ▼
   │ 3. Generate full strategy
   ▼
Server function → n8n webhook "stage2"  (Messaging + GTM agents run in
   │  parallel; Serper web search runs alongside them and feeds the SEO
   │  agent, which runs once search results are back)
   ▼
Results screen (5 tabs: Positioning / ICP / Messaging / GTM / SEO)
```

Everything after "Submit" happens through server functions — the browser
never talks to n8n directly, and never sees the webhook URLs or API key.

## Frontend

- **Stack**: TanStack Start (React, file-based routing, SSR) + Vite + Tailwind
  + shadcn/ui components. Deployed to Vercel, GitHub-connected for
  auto-deploy on push to `main`.
- **Everything lives in one route**: `src/routes/index.tsx` — the landing
  page, the 9-field form, the review screen, and the 5-tab results screen are
  all one component (`Index`) switching on a `screen` state value
  (`"landing" | "form" | "review" | "results"`). Not split into
  sub-components; this is a known area for future refactoring but works fine
  at the current size.
- **Local persistence**: recent runs (up to 10) are cached in
  `localStorage` (`positionpilot:recent_runs`) so the "Recent Runs" list on
  the form page can prefill or re-view past runs without hitting the backend.
  This is separate from the Postgres `strategy_runs` table, which is the
  source of truth.
- **Server functions** (`src/lib/api/*.functions.ts`, run via TanStack Start's
  `createServerFn`, never bundled to the client):
  - `webhook.functions.ts` → `callPositionPilotWebhook` — proxies all
    n8n calls (`stage1` / `approve` / `stage2`), attaching
    `POSITIONPILOT_WEBHOOK_API_KEY` server-side.
  - `rewrite.functions.ts` → `rewriteField` — calls OpenRouter directly
    (not through n8n) for the per-field "AI rewrite" button, so a single
    rewrite stays fast and isn't gated behind the multi-minute stage1/stage2
    timeout budget or the ngrok tunnel.
  - `waitlist.functions.ts` → `joinWaitlist` — writes to Supabase
    (`waitlist` table) and fires two Resend emails: one to the site owner
    (`WAITLIST_NOTIFY_EMAIL`), one confirmation to the signup's own address.
  - `config.server.ts` — the only place that reads `process.env`; every
    other server function goes through `getServerConfig()`.

## Backend (n8n)

- Self-hosted n8n via Docker, tunneled through ngrok
  (`blabber-ahead-defective.ngrok-free.dev`) since there's no stable public
  host yet. **Fragile** — breaks on local restart; migrating to Railway has
  been deliberately deferred until more features are built.
- Three webhooks, matching the three stages above:
  - **Stage 1** — "Build Prompts" code node constructs prompts with a
    sequential reasoning structure (steps 0-8) inside each individual
    prompt, then calls OpenRouter (`deepseek/deepseek-v4-flash`) for the
    Positioning and ICP agents **in parallel** (both fed from the same
    "Build Prompts" node) — returns a rich structured object per agent
    (see Data model below).
  - **Approve** — a Postgres node does
    `output = output || $edited_patch` (jsonb merge) so edited fields
    overwrite while everything the user didn't touch survives, then flips
    `status` to `'approved'`.
  - **Stage 2** — Messaging and GTM agents run **in parallel** against the
    approved foundation. A **Serper** node (Header Auth, dedicated
    "Serper API" credential — not the OpenRouter one) runs alongside them
    for live web search; the SEO agent is the only one gated — it runs once
    Serper's results are back, then all three converge before persisting.
- **Postgres** (`positionpilot` database, `strategy_runs` table): one row per
  `generation_run_id`, jsonb `output` column per agent, `status` column
  (`pending_review` → `approved` → `full`/`draft` as seen in the app's
  Recent Runs list).

## Data model (Stage 1 → Stage 2 handoff)

`positioning_output`:
`category_definition`, `positioning_statement`, `before_after_transformation`,
`differentiation_pillars[]`, `memorable_hook`, `brand_philosophy`,
`strategic_tension`

`icp_output`:
`primary_target_persona`, `behavioral_signals[]`, `buying_triggers[]`,
`customer_fears_and_risks[]`, `adoption_pattern`, `economic_buyer_profile`

All of the above are editable on the Step 2 review screen (edit / add /
delete / AI-rewrite), and edits are sent back through `approve` before Stage
2 runs — so Stage 2 always reasons over what the user actually approved, not
the raw AI draft.

## Known constraints / open items

- No auth system. No login, no saved-run ownership — "Recent Runs" is
  per-browser localStorage only. A magic-link (Supabase) "save your runs"
  flow has been discussed but isn't scoped or built.
- n8n/Postgres hosting is local + ngrok — a single point of failure, kept
  intentionally simple until more product features land.
- The whole frontend is one ~1600-line route file. Fine for now; a
  component split is the obvious next refactor if the file keeps growing.
