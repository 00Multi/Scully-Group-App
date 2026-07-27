# Deploying to Vercel

This app is **not** a Next.js project. It's a **TanStack Start** app (React + Vite,
server-rendered through Nitro). The "No Next.js version detected" error means Vercel
guessed the wrong framework — the `vercel.json` in this repo fixes that.

## What `vercel.json` does

```json
{
  "framework": null,
  "buildCommand": "NITRO_PRESET=vercel npm run build"
}
```

- `framework: null` tells Vercel this is **not** Next.js (Framework Preset = "Other"),
  which removes the detection error.
- `NITRO_PRESET=vercel` makes Nitro build for Vercel's **Build Output API** — the build
  writes `.vercel/output/`, which Vercel deploys directly (SSR function + static assets).
  (Without it the build defaults to a Cloudflare target.)

## One-time setup in the Vercel dashboard

1. **Import** the GitHub repo `00Multi/Scully-Group-App`.
2. **Root Directory:** repo root (leave as-is — `package.json` is at the root).
3. **Framework Preset:** "Other" (or leave it; `vercel.json` overrides it anyway).
4. **Build & Install commands:** leave the defaults — `vercel.json` sets the build
   command, and Vercel installs from the committed `bun.lock`.
5. **Deploy.**

## Environment variables

The Supabase client reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
These are already committed in `.env` (they are *publishable* keys, safe for the
browser), so the app connects to Supabase without any extra configuration.

To point a deployment at a different Supabase project, set these in
**Vercel → Project → Settings → Environment Variables** (they override `.env`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Local check

```bash
NITRO_PRESET=vercel npm run build   # produces .vercel/output/
```
