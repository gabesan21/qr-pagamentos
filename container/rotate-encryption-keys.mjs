import pg from "pg";

import { decrypt as nauttDecrypt, encrypt as nauttEncrypt } from "../src/lib/nautt-crypto.ts";
import { assertNoUnreadableRows, runRewrap } from "../src/security/key-rotation.ts";
import { decrypt as totpDecrypt, encrypt as totpEncrypt } from "../src/lib/totp-crypto.ts";
import { assertEncryptionKeyShape, databaseUrl, readOptionalSecret, readSecret, safeFailure } from "./lib.mjs";

const { Client } = pg;

// Thin process wrapper: the only file in this rotation feature allowed to
// touch the filesystem, environment, a database connection or the process
// exit code. All rewrap logic lives in src/security/key-rotation.ts.

function decodeKey(raw, name) {
  assertEncryptionKeyShape(raw, name);
  return Buffer.from(raw, "base64url");
}

function decodeOptionalKey(raw, name) {
  if (raw === undefined) return undefined;
  return decodeKey(raw, name);
}

const TARGETS = {
  nautt_api_key: { table: "nautt_credential", column: "encrypted_api_key", idColumn: "user_id" },
  nautt_webhook_secret: { table: "nautt_credential", column: "encrypted_webhook_secret", idColumn: "user_id" },
  totp_secret: { table: "totp_credential", column: "encrypted_secret", idColumn: "user_id" },
};

class PostgresRewrapStore {
  constructor(client) {
    this.client = client;
  }

  async *scan(target) {
    const { table, column, idColumn } = TARGETS[target];
    const result = await this.client.query(
      `SELECT ${idColumn} AS id, ${column} AS ciphertext FROM app.${table} WHERE ${column} IS NOT NULL`,
    );
    for (const row of result.rows) {
      yield { id: row.id, ciphertext: row.ciphertext };
    }
  }

  async updateConditional(target, id, expectedCiphertext, nextCiphertext) {
    const { table, column, idColumn } = TARGETS[target];
    const result = await this.client.query(
      `UPDATE app.${table} SET ${column} = $1 WHERE ${idColumn} = $2 AND ${column} = $3`,
      [nextCiphertext, id, expectedCiphertext],
    );
    return result.rowCount === 1;
  }
}

async function main() {
  const runtimePassword = await readSecret("/run/secrets/runtime_password");
  const url = databaseUrl({ username: "qr_runtime", password: runtimePassword, schema: true });

  const nauttKey = decodeKey(await readSecret("/run/secrets/nautt_encryption_key"), "NAUTT_ENCRYPTION_KEY");
  const nauttPreviousKey = decodeOptionalKey(
    await readOptionalSecret("/run/secrets/nautt_encryption_key_previous"),
    "NAUTT_ENCRYPTION_KEY_PREVIOUS",
  );
  const totpKey = decodeKey(await readSecret("/run/secrets/totp_encryption_key"), "TOTP_ENCRYPTION_KEY");
  const totpPreviousKey = decodeOptionalKey(
    await readOptionalSecret("/run/secrets/totp_encryption_key_previous"),
    "TOTP_ENCRYPTION_KEY_PREVIOUS",
  );

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const store = new PostgresRewrapStore(client);
    const reports = await runRewrap(
      store,
      { nauttKey, nauttPreviousKey, totpKey, totpPreviousKey },
      {
        nautt: { encrypt: nauttEncrypt, decrypt: nauttDecrypt },
        totp: { encrypt: totpEncrypt, decrypt: totpDecrypt },
      },
    );
    for (const report of reports) {
      console.log(
        `PASS rewrap table=${report.table} scanned=${report.scanned} rewrapped=${report.rewrapped} skipped=${report.skipped} unreadable=${report.unreadable}`,
      );
    }
    assertNoUnreadableRows(reports);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => safeFailure("rotate-encryption-keys", error));
