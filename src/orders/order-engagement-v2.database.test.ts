import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PrismaClient } from "../generated/prisma/client";
import {
  createOrderCommentV2Service,
  createOrderCommentV2Store,
  createOrderLocalOutcomeV2Service,
  createOrderLocalOutcomeV2Store,
  OrderEngagementV2ConflictError,
} from "./order-engagement-v2";

const enabled = process.env.ORDER_ENGAGEMENT_V2_DATABASE_TEST === "1";
const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ORDER_ENGAGEMENT_V2_DATABASE_ADMIN_URL;
const { Client } = pg;

const ownerId = "770e8400-e29b-41d4-a716-446655440010";
const otherOwnerId = "770e8400-e29b-41d4-a716-446655440011";
const pairId = "330e8400-e29b-41d4-a716-446655440012";
const currencyUuid = "440e8400-e29b-41d4-a716-446655440013";
const exchangeCurrencyUuid = "550e8400-e29b-41d4-a716-446655440014";
const linkId = "660e8400-e29b-41d4-a716-446655440015";
const orderId = "990e8400-e29b-41d4-a716-446655440016";
const concurrentOrderId = "aa0e8400-e29b-41d4-a716-446655440017";
const missingOrderId = "bb0e8400-e29b-41d4-a716-446655440018";

const OPAQUE_CONFLICT_MESSAGE = "Order engagement mutation did not match the expected version";

const actor = {
  id: ownerId,
  username: "engagement.database.owner",
  email: null,
  role: "USER" as const,
  status: "ACTIVE" as const,
  createdAt: new Date(),
};
const otherActor = { ...actor, id: otherOwnerId, username: "engagement.database.other" };

const firstAppendAt = new Date("2026-07-25T12:00:00.000Z");
const secondAppendAt = new Date("2026-07-25T13:00:00.000Z");
const commentCreatedAt = new Date("2026-07-25T14:00:00.000Z");
const commentEditedAt = new Date("2026-07-25T15:00:00.000Z");

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
  throw new Error(`Expected ${expected} concurrent runtime engagement operations to wait on a PostgreSQL lock`);
}

function expectOpaqueConflict(reason: unknown) {
  expect(isOpaqueConflict(reason)).toBe(true);
}

function isOpaqueConflict(reason: unknown): boolean {
  return reason instanceof OrderEngagementV2ConflictError && reason.message === OPAQUE_CONFLICT_MESSAGE;
}

async function expectSettlementFences(admin: pg.Client, targetOrderId: string, expectedState: string) {
  const order = await admin.query(
    `SELECT state, settled_at FROM app.order_v2 WHERE id = $1`,
    [targetOrderId],
  );
  expect(order.rows[0]).toMatchObject({ state: expectedState, settled_at: null });
  const claims = await admin.query(
    `SELECT count(*)::int AS count FROM app.payment_link_v2_single_use_settlement WHERE owner_id = $1`,
    [ownerId],
  );
  expect(claims.rows[0].count).toBe(0);
  const providerOrders = await admin.query(
    `SELECT count(*)::int AS count FROM app.provider_order WHERE order_v2_id = $1`,
    [targetOrderId],
  );
  expect(providerOrders.rows[0].count).toBe(0);
}

describe.skipIf(!enabled)("order engagement V2 PostgreSQL contract", () => {
  let firstDatabase: PrismaClient;
  let secondDatabase: PrismaClient;
  let admin: pg.Client;
  let blocker: pg.Client;

  beforeAll(async () => {
    if (!runtimeUrl || !adminUrl) throw new Error("Disposable engagement database URLs are required");
    firstDatabase = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
    secondDatabase = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
    admin = new Client({ connectionString: adminUrl });
    blocker = new Client({ connectionString: adminUrl });
    await admin.connect();
    await blocker.connect();
    await admin.query(
      `INSERT INTO app."user" (id, username, role, status)
       VALUES ($1, 'engagement.database.owner', 'USER', 'ACTIVE'),
              ($2, 'engagement.database.other', 'USER', 'ACTIVE')`,
      [ownerId, otherOwnerId],
    );
    await admin.query(
      `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid)
       VALUES ($1, 'engagement.database.pair', $2, $3)`,
      [pairId, currencyUuid, exchangeCurrencyUuid],
    );
    await admin.query(
      `INSERT INTO app.payment_link_v2
         (id, identifier, owner_id, composition_kind, description_pt_br, description_en,
          amount, currency_pair_id, link_type, expires_at, active, version, created_at, updated_at)
       VALUES ($1, 'engagementdatabaselink01', $2, 'FIXED_AMOUNT', 'Link', 'Link',
               '10.00', $3, 'SINGLE_USE', NULL, TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [linkId, ownerId, pairId],
    );
    await admin.query(
      `INSERT INTO app.order_v2
         (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount,
          currency_uuid, exchange_currency_uuid, checkout_data_policy, created_at, updated_at)
       VALUES
         ($1, $3, 'LINK', $4, 'PENDING', 0, '10.00', $5, $6, 'NONE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
         ($2, $3, 'LINK', $4, 'CONFIRMED', 0, '10.00', $5, $6, 'NONE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [orderId, concurrentOrderId, ownerId, linkId, currencyUuid, exchangeCurrencyUuid],
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
      await admin.query(`DELETE FROM app.order_comment_v2 WHERE owner_id = $1`, [ownerId]);
      await admin.query(`DELETE FROM app.order_local_outcome_v2 WHERE owner_id = $1`, [ownerId]);
      await admin.query(`DELETE FROM app.order_v2 WHERE owner_id = $1`, [ownerId]);
      await admin.query(`DELETE FROM app.payment_link_v2 WHERE id = $1`, [linkId]);
      await admin.query(`DELETE FROM app.catalog_currency_pair WHERE id = $1`, [pairId]);
      await admin.query(`DELETE FROM app."user" WHERE id IN ($1, $2)`, [ownerId, otherOwnerId]);
      await admin.end();
    }
  });

  it("appends local outcomes under lifecycle CAS with latest-is-current and never touches settlement state", async () => {
    let now = firstAppendAt;
    const outcomes = createOrderLocalOutcomeV2Service(createOrderLocalOutcomeV2Store(firstDatabase), { now: () => now });

    const first = await outcomes.append(actor, orderId, 0, "LOCAL_FINALIZED", "checked with the customer");
    expect(first.outcome).toBe("LOCAL_FINALIZED");

    await expect(outcomes.append(actor, orderId, 0, "LOCAL_CANCELLED", null)).rejects.toSatisfy(isOpaqueConflict);

    now = secondAppendAt;
    const second = await outcomes.append(actor, orderId, 1, "LOCAL_CANCELLED", null);
    expect(second.outcome).toBe("LOCAL_CANCELLED");
    expect(second.note).toBeNull();

    const history = await admin.query(
      `SELECT outcome FROM app.order_local_outcome_v2 WHERE order_id = $1 ORDER BY created_at, id`,
      [orderId],
    );
    expect(history.rows.map((row) => row.outcome)).toEqual(["LOCAL_FINALIZED", "LOCAL_CANCELLED"]);

    const order = await admin.query(
      `SELECT lifecycle_version, updated_at FROM app.order_v2 WHERE id = $1`,
      [orderId],
    );
    expect(order.rows[0].lifecycle_version).toBe(2);
    expect(order.rows[0].updated_at).toEqual(secondAppendAt);
    await expectSettlementFences(admin, orderId, "PENDING");
  });

  it("shares one opaque conflict for cross-owner and missing order identities", async () => {
    const outcomes = createOrderLocalOutcomeV2Service(createOrderLocalOutcomeV2Store(firstDatabase));
    const comments = createOrderCommentV2Service(createOrderCommentV2Store(firstDatabase));

    await expect(outcomes.append(otherActor, orderId, 2, "LOCAL_FINALIZED", null)).rejects.toSatisfy(isOpaqueConflict);
    await expect(outcomes.append(actor, missingOrderId, 0, "LOCAL_FINALIZED", null)).rejects.toSatisfy(isOpaqueConflict);
    await expect(comments.append(otherActor, orderId, "not yours")).rejects.toSatisfy(isOpaqueConflict);
    await expect(comments.append(actor, missingOrderId, "missing")).rejects.toSatisfy(isOpaqueConflict);

    const leaked = await admin.query(
      `SELECT
         (SELECT count(*)::int FROM app.order_local_outcome_v2 WHERE owner_id = $1) AS outcomes,
         (SELECT count(*)::int FROM app.order_comment_v2 WHERE owner_id = $1) AS comments`,
      [otherOwnerId],
    );
    expect(leaked.rows[0]).toMatchObject({ outcomes: 0, comments: 0 });
    await expectSettlementFences(admin, orderId, "PENDING");
  });

  it("serializes concurrent outcome appends to one commit and one opaque conflict", async () => {
    const first = createOrderLocalOutcomeV2Service(createOrderLocalOutcomeV2Store(firstDatabase));
    const second = createOrderLocalOutcomeV2Service(createOrderLocalOutcomeV2Store(secondDatabase));
    await blocker.query("BEGIN");
    await blocker.query(`SELECT id FROM app.order_v2 WHERE id = $1 FOR UPDATE`, [concurrentOrderId]);

    const appendFirst = first.append(actor, concurrentOrderId, 0, "LOCAL_FINALIZED", null);
    const appendSecond = second.append(actor, concurrentOrderId, 0, "LOCAL_CANCELLED", "raced");
    await waitForRuntimeLock(admin, 2);
    await blocker.query("COMMIT");
    const results = await Promise.allSettled([appendFirst, appendSecond]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expectOpaqueConflict(rejected[0]?.reason);

    const persisted = await admin.query(
      `SELECT lifecycle_version FROM app.order_v2 WHERE id = $1`,
      [concurrentOrderId],
    );
    expect(persisted.rows[0].lifecycle_version).toBe(1);
    const history = await admin.query(
      `SELECT count(*)::int AS count FROM app.order_local_outcome_v2 WHERE order_id = $1`,
      [concurrentOrderId],
    );
    expect(history.rows[0].count).toBe(1);
    await expectSettlementFences(admin, concurrentOrderId, "CONFIRMED");
  });

  it("edits comments author-only under expected-version CAS stamping edited_at, without touching the order", async () => {
    let now = commentCreatedAt;
    const comments = createOrderCommentV2Service(createOrderCommentV2Store(firstDatabase), { now: () => now });

    const created = await comments.append(actor, orderId, "first note");
    expect(created).toMatchObject({ version: 0, editedAt: null, authorId: ownerId });

    await expect(comments.edit(actor, created.id, 1, "stale version")).rejects.toSatisfy(isOpaqueConflict);
    await expect(comments.edit(otherActor, created.id, 0, "not the author")).rejects.toSatisfy(isOpaqueConflict);

    const untouched = await admin.query(
      `SELECT body, version, edited_at FROM app.order_comment_v2 WHERE id = $1`,
      [created.id],
    );
    expect(untouched.rows[0]).toMatchObject({ body: "first note", version: 0, edited_at: null });

    now = commentEditedAt;
    const edited = await comments.edit(actor, created.id, 0, "revised note");
    expect(edited).toMatchObject({ body: "revised note", version: 1, editedAt: commentEditedAt });

    const order = await admin.query(
      `SELECT lifecycle_version, updated_at FROM app.order_v2 WHERE id = $1`,
      [orderId],
    );
    expect(order.rows[0].lifecycle_version).toBe(2);
    expect(order.rows[0].updated_at).toEqual(secondAppendAt);
    await expectSettlementFences(admin, orderId, "PENDING");
  });
});
