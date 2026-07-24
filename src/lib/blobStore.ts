import { getStore } from "@netlify/blobs";

// Only ever called when running inside a deployed Netlify Function or under `netlify dev` —
// both automatically inject the context getStore() needs (site ID + a scoped token), so no
// manual configuration is required here. See src/lib/upload.ts for the environment switch that
// decides whether to call this at all.
export function getUploadsStore() {
  return getStore("uploads");
}
