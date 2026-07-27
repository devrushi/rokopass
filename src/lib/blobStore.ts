import { getStore } from "@netlify/blobs";

// Normally called only inside a deployed Netlify Function or under `netlify dev` — both
// automatically inject the context getStore() needs (site ID + a scoped token), no manual
// configuration required. The explicit-credential fallback below exists for one specific extra
// case: running a one-off script (e.g. demo-data seeding) from a plain local process against the
// real production Blobs store, outside any Netlify-managed runtime — see prisma/seed-demo.ts.
export function getUploadsStore() {
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    return getStore({
      name: "uploads",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    });
  }
  return getStore("uploads");
}
