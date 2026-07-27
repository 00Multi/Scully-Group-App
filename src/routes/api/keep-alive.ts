import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Keep-alive endpoint for the free-tier Supabase project, which pauses after
// ~7 days of no API activity. A Vercel Cron (see vercel.json) hits this once a
// day; the single lightweight read below counts as activity and resets the
// timer, so the project never pauses.
//
// The URL + publishable key are the same public credentials committed in .env
// (safe for the browser). We prefer runtime env vars so a repointed deployment
// keeps itself alive too, and fall back to the pinned values so the cron works
// with zero extra configuration.
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://feyemnjxzrguktbthzzi.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_ZB-HpxLrUcpIpi1lZguXNw_wukqZdvY";

export const Route = createFileRoute("/api/keep-alive")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/material_categories?select=id&limit=1`, {
            headers: { apikey: SUPABASE_KEY },
          });
          const ok = res.ok;
          return new Response(
            JSON.stringify({ ok, status: res.status, pinged_at: new Date().toISOString() }),
            {
              status: ok ? 200 : 502,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "request failed" }),
            {
              status: 502,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            },
          );
        }
      },
    },
  },
});
