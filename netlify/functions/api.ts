import type { Handler, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";

// Must be set before the first (dynamic, see below) import of ../../src/app — src/lib/upload.ts
// and src/app.ts both read this at module-load time to decide whether uploads go to Netlify
// Blobs (here) or local disk (everywhere else: plain `tsx watch`, tests, demo seeding). A static
// `import` at the top of this file would be hoisted and evaluate before this assignment runs, so
// the app is imported lazily inside getServerlessHandler() instead.
process.env.RUNNING_IN_NETLIFY_FUNCTION = "true";

// DATABASE_URL is expected to already be a plain site environment variable by the time this
// function runs (see AGENTS.md) — Netlify's built-in database's dynamic NETLIFY_DB_URL binding
// (both a raw process.env read and @netlify/database's own getConnectionString()) confirmed
// absent at runtime for this classic Lambda-handler-style function; that binding appears to only
// reach Netlify's newer v2/edge function runtimes, not this one.

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
      // netlify.toml rewrites /api/* to /.netlify/functions/api/:splat, but Netlify's runtime
      // already strips its own "/.netlify/functions/api" routing prefix before the event reaches
      // this handler — confirmed by testing (a request the frontend sent to "/api/health" showed
      // up here as exactly that, not the full rewritten path). So only the app's own "/api"
      // namespace prefix needs stripping for Express to see the paths its routes actually expect
      // (e.g. "/auth/login", not "/api/auth/login").
      basePath: "/api",
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
