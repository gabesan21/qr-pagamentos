import { afterAll, describe, expect, it } from "vitest";

import { getDatabaseClient } from "../src/db/client";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;
const prisma = hasDatabase ? getDatabaseClient() : undefined;

describeDatabase("runtime Prisma contract", () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("performs fixture CRUD through only the runtime connection", async () => {
    if (!prisma) {
      throw new Error("DATABASE_URL is required for this database probe");
    }

    const key = `runtime-crud-${process.pid}`;
    const created = await prisma.databaseFoundationFixture.create({
      data: { key, quantity: 1 },
    });

    expect(created.id).toBeTypeOf("bigint");
    expect(created.createdAt).toBeInstanceOf(Date);
    await expect(
      prisma.databaseFoundationFixture.findUniqueOrThrow({ where: { key } }),
    ).resolves.toMatchObject({ quantity: 1 });
    await expect(
      prisma.databaseFoundationFixture.update({
        where: { key },
        data: { quantity: 2 },
      }),
    ).resolves.toMatchObject({ quantity: 2 });
    await prisma.databaseFoundationFixture.delete({ where: { key } });

    console.log("PASS runtime-crud");
  });
});
