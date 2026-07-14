import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

let client: PrismaClient | undefined;

export function getDatabaseClient(): PrismaClient {
  if (client) {
    return client;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for runtime database access");
  }

  client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  return client;
}
