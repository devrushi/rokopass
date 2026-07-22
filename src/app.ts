import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { activitiesRouter } from "./routes/activities";
import { ageGroupsRouter } from "./routes/ageGroups";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { sessionsRouter } from "./routes/sessions";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  }

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/activities", activitiesRouter);
  app.use("/sessions", sessionsRouter);
  app.use("/age-groups", ageGroupsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
