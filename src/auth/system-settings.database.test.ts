import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDatabaseClient } from "../db/client";
import { getAdministrationService } from "./administration";
import type { Principal } from "./authorization";
import { getSystemSettingsService } from "./system-settings";

const enabled = process.env.SYSTEM_SETTINGS_DATABASE_TEST === "1";
const adminUrl = process.env.SYSTEM_SETTINGS_DATABASE_ADMIN_URL;
const { Client } = pg;

const actor: Principal = {
  id: "dd0e8400-e29b-41d4-a716-446655440020",
  username: "system.settings.db.admin",
  email: null,
  role: "ADMIN",
  status: "ACTIVE",
  createdAt: new Date("2026-07-27T00:00:00Z"),
};

describe.skipIf(!enabled)("system settings against PostgreSQL", () => {
  let admin: pg.Client;

  beforeAll(async () => {
    if (!adminUrl || !process.env.DATABASE_URL) throw new Error("Disposable system-settings database URLs are required");
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`INSERT INTO app."user" (id, username, role, status) VALUES ($1, 'system.settings.db.admin', 'ADMIN', 'ACTIVE')`, [actor.id]);
  });

  afterAll(async () => {
    if (admin) {
      await admin.query(`DELETE FROM app.password_credential WHERE user_id IN (SELECT id FROM app."user" WHERE username LIKE 'system.settings.db.%')`);
      await admin.query(`DELETE FROM app."user" WHERE username LIKE 'system.settings.db.%'`);
      await admin.query(`DELETE FROM app.system_settings WHERE id = 1`);
      await admin.end();
    }
    await getDatabaseClient().$disconnect();
  });

  it("resolves the code constant on the empty start, then persists and resolves the administrator choice", async () => {
    const service = getSystemSettingsService();

    await expect(service.getDefaultTheme(actor)).resolves.toBe("pix-paper");

    await service.saveDefaultTheme(actor, "vault-blue");

    await expect(service.resolveDefaultThemeId()).resolves.toBe("vault-blue");
    const persisted = await admin.query(`SELECT default_theme_id FROM app.system_settings WHERE id = 1`);
    expect(persisted.rows).toEqual([{ default_theme_id: "vault-blue" }]);

    await service.saveDefaultTheme(actor, "terminal-amber");
    const replaced = await admin.query(`SELECT id, default_theme_id FROM app.system_settings`);
    expect(replaced.rows).toEqual([{ id: 1, default_theme_id: "terminal-amber" }]);
  });

  it("stamps the effective default only on merchant users created afterward", async () => {
    await getSystemSettingsService().saveDefaultTheme(actor, "terminal-amber");
    const administration = getAdministrationService();

    await administration.createUser(actor, { username: "system.settings.db.user", password: "correct horse battery staple", role: "USER" });
    await administration.createUser(actor, { username: "system.settings.db.other", password: "correct horse battery staple", role: "ADMIN" });

    const stamped = await admin.query(
      `SELECT username, storefront_theme_id FROM app."user" WHERE username IN ('system.settings.db.user', 'system.settings.db.other') ORDER BY username`,
    );
    expect(stamped.rows).toEqual([
      { username: "system.settings.db.other", storefront_theme_id: null },
      { username: "system.settings.db.user", storefront_theme_id: "terminal-amber" },
    ]);
    const actorRow = await admin.query(`SELECT storefront_theme_id FROM app."user" WHERE id = $1`, [actor.id]);
    expect(actorRow.rows[0].storefront_theme_id).toBeNull();
  });
});
