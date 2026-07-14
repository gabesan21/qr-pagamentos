import { defineConfig } from "prisma/config";

const generationOnlyUrl = "postgresql://127.0.0.1:1/unreachable";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL ?? generationOnlyUrl,
  },
});
