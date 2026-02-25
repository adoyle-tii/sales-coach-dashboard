# Sales Coach Dashboard

React + Vite dashboard for sellers and managers. Uses Supabase for auth and data (RLS enforced).

## Setup

1. Copy `.env.example` to `.env.local` and set:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — **Publishable key** (`sb_publishable_...`) or legacy **anon** key
   - `VITE_WORKER_URL` (optional) — Worker URL for any API calls

2. Install and run:
   ```bash
   npm install
   npm run dev
   ```

3. Build:
   ```bash
   npm run build
   ```
   Output is in `dist/`.

## Deploy to Cloudflare Pages

1. Connect the repo to Cloudflare Pages (or upload `dist/` after building locally).
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Add environment variables in the dashboard: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable or legacy anon key), `VITE_WORKER_URL`.
5. Add the Pages URL to your Supabase Auth redirect URLs (Authentication → URL Configuration) and to the Google OAuth client authorized origins.

## Routes

- `/login` — Google sign-in
- `/my` — Seller: assessments, sessions, PDP
- `/team` — Manager: team list
- `/team/:userId` — Manager: individual rep drill-down
