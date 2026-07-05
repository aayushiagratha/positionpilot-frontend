# PositionPilot

AI-powered GTM strategy generator. Give it 9 facts about your company and it
drafts a full go-to-market strategy — positioning, ICP, messaging, GTM plan,
and SEO — reviewable and editable before the final strategy is generated.

Live: **[positionpilot-ai.vercel.app](https://positionpilot-ai.vercel.app)**

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the pipeline works end to end.

## How it works

1. **Tell us about your business** — fill in 9 fields (product, audience,
   competitors, business model, etc.).
2. **Review your foundation** — an AI agent drafts your positioning and ICP.
   Edit, add, delete, or ask AI to rewrite any field before continuing.
3. **Get your full strategy** — approving generates Messaging, GTM, and SEO
   agents' output from your approved foundation, across 5 result tabs.

## Stack

- [TanStack Start](https://tanstack.com/start) (React, file-based routing,
  SSR) + Vite + Tailwind + shadcn/ui
- Server functions (`src/lib/api/*.functions.ts`) proxy all backend calls —
  no API keys or webhook URLs ever reach the browser
- Backend: self-hosted [n8n](https://n8n.io/) workflows + Postgres, calling
  OpenRouter (DeepSeek) for generation and Serper for live web search
- Supabase for waitlist signups, Resend for waitlist emails
- Deployed on Vercel, auto-deploys on push to `main`

## Local development

```bash
bun install
bun run dev
```

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
| --- | --- |
| `POSITIONPILOT_STAGE1_URL` | n8n webhook — drafts positioning + ICP |
| `POSITIONPILOT_APPROVE_URL` | n8n webhook — saves reviewed/edited foundation |
| `POSITIONPILOT_STAGE2_URL` | n8n webhook — generates Messaging/GTM/SEO |
| `POSITIONPILOT_WEBHOOK_API_KEY` | Shared secret for the three webhooks above |
| `OPENROUTER_API_KEY` | Used directly by the per-field "AI rewrite" button |
| `RESEND_API_KEY` | Sends waitlist notification + confirmation emails |
| `WAITLIST_NOTIFY_EMAIL` | Where new waitlist signups get reported |

The n8n/Postgres backend isn't included in this repo — it runs separately
(currently local + ngrok tunnel; see ARCHITECTURE.md for details). Workflow
JSON exports, schema, and setup instructions for that backend live in
[aayushiagratha/positionpilot](https://github.com/aayushiagratha/positionpilot).

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the dev server |
| `bun run build` | Production build |
| `bun run lint` | Lint |
| `bun run format` | Format with Prettier |
