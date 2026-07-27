import type { Handler, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";

// Must be set before the first (dynamic, see below) import of ../../src/app — src/lib/upload.ts
// and src/app.ts both read this at module-load time to decide whether uploads go to Netlify
// Blobs (here) or local disk (everywhere else: plain `tsx watch`, tests, demo seeding). A static
// `import` at the top of this file would be hoisted and evaluate before this assignment runs, so
// the app is imported lazily inside getServerlessHandler() instead.
process.env.RUNNING_IN_NETLIFY_FUNCTION = "true";

// Netlify's built-in database (see AGENTS.md) injects its connection string as NETLIFY_DB_URL,
// not DATABASE_URL — Prisma (via src/config/env.ts) only knows about the latter, and validates
// it eagerly at import time, so this has to happen before the dynamic import below too. Kept as
// a bridge here rather than changing env.ts/schema.prisma to read NETLIFY_DB_URL directly, so
// local dev/tests/CI keep using a plain DATABASE_URL with no Netlify-specific knowledge at all.
if (!process.env.DATABASE_URL && process.env.NETLIFY_DB_URL) {
  process.env.DATABASE_URL = process.env.NETLIFY_DB_URL;
}

type ServerlessHandler = ReturnType<typeof serverless>;
let cachedHandler: ServerlessHandler | null = null;

// Netlify (like AWS Lambda underneath it) reuses a warm process across nearby invocations —
// caching the wrapped Express app avoids rebuilding it (and reconnecting Prisma) on every single
// request, not just the first one after a cold start.
async function getServerlessHandler(): Promise<ServerlessHandler> {
  if (!cachedHandler) {
    const { createApp } = await import("../../src/app");
    const app = createApp();
    cachedHandler = serverless(app, {
      // netlify.toml rewrites /api/* to /.netlify/functions/api/:splat — Netlify's proxy keeps
      // that full rewritten path on the event, so Express needs this prefix stripped to see the
      // paths its routes actually expect (e.g. "/auth/login", not
      // "/.netlify/functions/api/auth/login").
      basePath: "/.netlify/functions/api",
      // Content types that must survive as exact bytes (base64 round-tripped by Netlify's proxy)
      // rather than being treated as UTF-8 text — file uploads, and the PDF/CSV statement
      // downloads. Deliberately does NOT include application/json: both ordinary JSON API
      // traffic and the raw Stripe webhook body (see src/routes/webhooks.ts, which needs the
      // exact original bytes for signature verification) are correct as plain text passthrough.
      binary: ["image/*", "multipart/form-data", "application/pdf", "text/csv"],
    });
  }
  return cachedHandler;
}

export const handler: Handler = async (event, context) => {
  const serverlessHandler = await getServerlessHandler();
  const response = await serverlessHandler(event, context);
  return response as HandlerResponse;
};
