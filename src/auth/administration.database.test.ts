import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDatabaseClient } from "../db/client";
import { getAdministrationService } from "./administration";
import type { Principal } from "./authorization";

const enabled = process.env.ADMINISTRATION_DATABASE_TEST === "1";
const adminUrl = process.env.ADMINISTRATION_DATABASE_ADMIN_URL;
const { Client } = pg;

const actorId = "aa0e8400-e29b-41d4-a716-446655440010";
const deleteTargetId = "bb0e8400-e29b-41d4-a716-446655440011";
const mutateTargetId = "cc0e8400-e29b-41d4-a716-446655440012";

const actor: Principal = {
  id: actorId,
  username: "administration.db.admin",
  email: null,
  role: "ADMIN",
  status: "ACTIVE",
  createdAt: new Date("2026-07-26T00:00:00Z"),
};

describe.skipIf(!enabled)("administration locked mutations against PostgreSQL", () => {
  let admin: pg.Client;

  beforeAll(async () => {
    if (!adminUrl || !process.env.DATABASE_URL) throw new Error("Disposable administration database URLs are required");
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(
      `INSERT INTO app."user" (id, username, role, status)
       VALUES
         ($1, 'administration.db.admin', 'ADMIN', 'ACTIVE'),
         ($2, 'administration.db.delete', 'USER', 'ACTIVE'),
         ($3, 'administration.db.mutate', 'USER', 'ACTIVE')`,
      [actorId, deleteTargetId, mutateTargetId],
    );
  });

  afterAll(async () => {
    if (admin) {
      await admin.query(`DELETE FROM app.user_deletion WHERE user_id = ANY($1::uuid[])`, [[deleteTargetId, mutateTargetId]]);
      await admin.query(`DELETE FROM app."user" WHERE id = ANY($1::uuid[])`, [[actorId, deleteTargetId, mutateTargetId]]);
      await admin.end();
    }
    await getDatabaseClient().$disconnect();
  });

  it("deletes a user through the authorization advisory lock", async () => {
    await getAdministrationService().deleteUser(actor, deleteTargetId);

    const persisted = await admin.query(
      `SELECT status, deleted_at FROM app."user" WHERE id = $1`,
      [deleteTargetId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].status).toBe("DISABLED");
    expect(persisted.rows[0].deleted_at).toBeInstanceOf(Date);
    const audit = await admin.query(
      `SELECT actor_id FROM app.user_deletion WHERE user_id = $1`,
      [deleteTargetId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(actorId);
  });

  it("changes status and role through the authorization advisory lock", async () => {
    const service = getAdministrationService();

    await service.changeStatus(actor, mutateTargetId, "DISABLED");
    await service.changeRole(actor, mutateTargetId, "ADMIN");

    const persisted = await admin.query(
      `SELECT status, role FROM app."user" WHERE id = $1`,
      [mutateTargetId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({ status: "DISABLED", role: "ADMIN" });
  });
});
