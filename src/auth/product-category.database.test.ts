import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client";
import {
  createDatabaseProductCategoryStore,
  createProductCategoryService,
  ProductCategoryConflictError,
} from "./product-category";

const enabled = process.env.PRODUCT_CATEGORY_DATABASE_TEST === "1";
const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.PRODUCT_CATEGORY_DATABASE_ADMIN_URL;
const { Client } = pg;

const ownerId = "770e8400-e29b-41d4-a716-446655440000";
const editSourceId = "ee0e8400-e29b-41d4-a716-446655440001";
const moveSourceId = "ff0e8400-e29b-41d4-a716-446655440002";
const replacementAId = "110e8400-e29b-41d4-a716-446655440003";
const replacementBId = "220e8400-e29b-41d4-a716-446655440004";
const productId = "880e8400-e29b-41d4-a716-446655440005";

const actor = {
  id: ownerId,
  username: "category.database.owner",
  email: null,
  role: "USER" as const,
  status: "ACTIVE" as const,
  createdAt: new Date(),
};

async function waitForRuntimeLock(observer: pg.Client, expected: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await observer.query(`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE usename = 'qr_runtime' AND wait_event_type = 'Lock'
    `);
    if (result.rows[0]?.count >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${expected} concurrent runtime category operations to wait on a PostgreSQL lock`);
}

function expectOneOpaqueConflict(results: PromiseSettledResult<unknown>[]) {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.filter((result) => result.status === "rejected");
  const reason = rejected[0]?.reason as { constructor?: { name?: string }; code?: unknown; message?: unknown; meta?: unknown } | undefined;
  expect(
    rejected.filter((result) => result.reason instanceof ProductCategoryConflictError),
    `Unexpected rejected result: ${reason?.constructor?.name ?? "none"} code=${String(reason?.code)} meta=${JSON.stringify(reason?.meta)} message=${String(reason?.message)}`,
  ).toHaveLength(1);
}

describe.skipIf(!enabled)("product category PostgreSQL concurrency", () => {
  let firstDatabase: PrismaClient;
  let secondDatabase: PrismaClient;
  let admin: pg.Client;
  let blocker: pg.Client;

  beforeAll(async () => {
    if (!runtimeUrl || !adminUrl) throw new Error("Disposable category database URLs are required");
    firstDatabase = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
    secondDatabase = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
    admin = new Client({ connectionString: adminUrl });
    blocker = new Client({ connectionString: adminUrl });
    await admin.connect();
    await blocker.connect();
    await admin.query(
      `INSERT INTO app."user" (id, username, role, status)
       VALUES ($1, 'category.database.owner', 'USER', 'ACTIVE')`,
      [ownerId],
    );
    await admin.query(
      `INSERT INTO app.product_category
         (id, owner_id, name_pt_br, name_en, active, version, created_at, updated_at)
       VALUES
         ($1, $5, 'Editar', 'Edit', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
         ($2, $5, 'Mover', 'Move', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
         ($3, $5, 'Destino A', 'Target A', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
         ($4, $5, 'Destino B', 'Target B', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [editSourceId, moveSourceId, replacementAId, replacementBId, ownerId],
    );
    await admin.query(
      `INSERT INTO app.product
         (id, owner_id, category_id, internal_name, title_pt_br, title_en,
          description_pt_br, description_en, price)
       VALUES
         ($1, $2, $3, 'database-category-product', 'Produto', 'Product',
          'Descrição', 'Description', '10')`,
      [productId, ownerId, moveSourceId],
    );
  });

  afterAll(async () => {
    if (blocker) {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await blocker.end();
    }
    if (firstDatabase) await firstDatabase.$disconnect();
    if (secondDatabase) await secondDatabase.$disconnect();
    if (admin) {
      await admin.query(`DELETE FROM app.product WHERE id = $1`, [productId]);
      await admin.query(`DELETE FROM app.product_category WHERE owner_id = $1`, [ownerId]);
      await admin.query(`DELETE FROM app."user" WHERE id = $1`, [ownerId]);
      await admin.end();
    }
  });

  it("denies physical category deletion to the runtime role", async () => {
    const privilege = await admin.query(
      `SELECT has_table_privilege('qr_runtime', 'app.product_category', 'DELETE') AS can_delete`,
    );
    expect(privilege.rows[0]?.can_delete).toBe(false);
    await expect(firstDatabase.productCategory.deleteMany({ where: { ownerId } }))
      .rejects.toThrow(/permission denied/i);
  });

  it("serializes edit versus deactivation to one commit and one opaque conflict", async () => {
    const first = createProductCategoryService(createDatabaseProductCategoryStore(firstDatabase));
    const second = createProductCategoryService(createDatabaseProductCategoryStore(secondDatabase));
    await blocker.query("BEGIN");
    await blocker.query(`SELECT id FROM app.product_category WHERE id = $1 FOR UPDATE`, [editSourceId]);

    const edit = first.update(actor, editSourceId, 0, { namePtBr: "Editado", nameEn: "Edited" });
    const deactivate = second.deactivate(actor, editSourceId, 0, null);
    await waitForRuntimeLock(admin, 2);
    await blocker.query("COMMIT");
    const results = await Promise.allSettled([edit, deactivate]);

    expectOneOpaqueConflict(results);
    const persisted = await admin.query(
      `SELECT name_en, active, version FROM app.product_category WHERE id = $1`,
      [editSourceId],
    );
    expect(persisted.rows[0].version).toBe(1);
    expect(
      (persisted.rows[0].active && persisted.rows[0].name_en === "Edited")
      || (!persisted.rows[0].active && persisted.rows[0].name_en === "Edit"),
    ).toBe(true);
  });

  it("serializes competing replacements and never leaves a partial product move", async () => {
    const first = createProductCategoryService(createDatabaseProductCategoryStore(firstDatabase));
    const second = createProductCategoryService(createDatabaseProductCategoryStore(secondDatabase));
    await blocker.query("BEGIN");
    await blocker.query(`SELECT id FROM app.product_category WHERE id = $1 FOR UPDATE`, [moveSourceId]);

    const replaceWithA = first.deactivate(actor, moveSourceId, 0, replacementAId);
    const replaceWithB = second.deactivate(actor, moveSourceId, 0, replacementBId);
    await waitForRuntimeLock(admin, 2);
    await blocker.query("COMMIT");
    const results = await Promise.allSettled([replaceWithA, replaceWithB]);

    expectOneOpaqueConflict(results);
    const persisted = await admin.query(
      `SELECT c.active, c.version, p.category_id
       FROM app.product_category c
       JOIN app.product p ON p.id = $2
       WHERE c.id = $1`,
      [moveSourceId, productId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({ active: false, version: 1 });
    expect([replacementAId, replacementBId]).toContain(persisted.rows[0].category_id);
    const sourceReferences = await admin.query(
      `SELECT count(*)::int AS count FROM app.product WHERE category_id = $1`,
      [moveSourceId],
    );
    expect(sourceReferences.rows[0].count).toBe(0);
  });
});
