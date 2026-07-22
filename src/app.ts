import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { UPLOAD_ROOT } from "./lib/upload";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { activitiesRouter } from "./routes/activities";
import { adminRouter } from "./routes/admin";
import { ageGroupsRouter } from "./routes/ageGroups";
import { authRouter } from "./routes/auth";
import { billingRouter } from "./routes/billing";
import { bookingsRouter } from "./routes/bookings";
import { childrenRouter } from "./routes/children";
import { healthRouter } from "./routes/health";
import { sessionsRouter } from "./routes/sessions";
import { webhooksRouter } from "./routes/webhooks";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));

  // Must be mounted before express.json() — Stripe signature verification needs the raw,
  // unparsed request body bytes.
  app.use("/webhooks", express.raw({ type: "application/json" }), webhooksRouter);

  app.use(express.json());
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  }

  // helmet's default Cross-Origin-Resource-Policy: same-origin would otherwise block the
  // frontend (a different origin in dev — 5173 vs 3000) from rendering these images in <img>
  // tags. Only relaxed for this one static path, not the whole app.
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(UPLOAD_ROOT),
  );

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/activities", activitiesRouter);
  app.use("/sessions", sessionsRouter);
  app.use("/age-groups", ageGroupsRouter);
  app.use("/billing", billingRouter);
  app.use("/children", childrenRouter);
  app.use("/bookings", bookingsRouter);
  app.use("/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
