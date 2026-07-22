import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.$connect();
  console.log("Connected to PostgreSQL");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`Server listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
