import { getStore } from "@netlify/blobs";

// Netlify's dynamic Blobs binding (site ID + a scoped token, normally auto-injected) does not
// reach this function's runtime — confirmed the same way as the NETLIFY_DB_URL binding gap (see
// AGENTS.md): both appear to only reach Netlify's newer v2/edge function runtimes, not this
// classic Lambda-handler-style one. BLOBS_AUTH_TOKEN (deliberately not NETLIFY_AUTH_TOKEN, a name
// netlify-cli itself treats specially) is a full personal access token set as a site env var —
// broader access than this narrow use needs, a deliberate short-term tradeoff; see AGENTS.md for
// the real fix (migrating to a function shape that gets these bindings natively).
export function getUploadsStore() {
  if (process.env.NETLIFY_SITE_ID && process.env.BLOBS_AUTH_TOKEN) {
    return getStore({
      name: "uploads",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.BLOBS_AUTH_TOKEN,
    });
  }
  return getStore("uploads");
}
