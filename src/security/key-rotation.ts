// Rewrap core for encryption key rotation (13.2.3). Pure, unit-testable
// module: no Docker, no filesystem, no process exit, no logging of any
// secret value. It receives an injected store (row access) and injected
// crypto (encrypt/decrypt per key family) and returns only counts and fixed
// codes per table. The thin process wrapper lives in
// container/rotate-encryption-keys.mjs.

export type ColumnTarget = "nautt_api_key" | "nautt_webhook_secret" | "totp_secret";

export interface RewrapRow {
  /** Opaque row identifier for the store implementation (e.g. user_id). */
  id: string;
  ciphertext: string;
}

export interface RewrapStore {
  /** Yields every non-null ciphertext row for the given column. */
  scan(target: ColumnTarget): AsyncIterable<RewrapRow>;
  /**
   * Updates exactly the target column for the row identified by `id`,
   * conditional on the ciphertext observed when the row was read.
   * Returns true when the conditional update applied, false when the
   * observed ciphertext no longer matched (safe no-op, not an error).
   */
  updateConditional(
    target: ColumnTarget,
    id: string,
    expectedCiphertext: string,
    nextCiphertext: string,
  ): Promise<boolean>;
}

export interface RewrapCrypto {
  decrypt(ciphertext: string, key: Buffer): string;
  encrypt(plaintext: string, key: Buffer): string;
}

export interface RewrapTargetConfig {
  target: ColumnTarget;
  crypto: RewrapCrypto;
  key: Buffer;
  previousKey?: Buffer;
}

export type RewrapOutcome = "rewrapped" | "skipped" | "unreadable";

export interface RewrapCounts {
  scanned: number;
  rewrapped: number;
  skipped: number;
  unreadable: number;
}

function emptyCounts(): RewrapCounts {
  return { scanned: 0, rewrapped: 0, skipped: 0, unreadable: 0 };
}

function mergeCounts(a: RewrapCounts, b: RewrapCounts): RewrapCounts {
  return {
    scanned: a.scanned + b.scanned,
    rewrapped: a.rewrapped + b.rewrapped,
    skipped: a.skipped + b.skipped,
    unreadable: a.unreadable + b.unreadable,
  };
}

/**
 * Resolves a single row: already readable under the current key is left
 * alone (idempotent); readable only under the previous key is rewrapped
 * with a write conditional on the ciphertext this call observed; readable
 * under neither key is unreadable (never a silent skip).
 */
async function rewrapRow(store: RewrapStore, config: RewrapTargetConfig, row: RewrapRow): Promise<RewrapOutcome> {
  try {
    config.crypto.decrypt(row.ciphertext, config.key);
    return "skipped";
  } catch {
    // Not decryptable with the current key; fall through to the previous key.
  }
  if (!config.previousKey) return "unreadable";
  let plaintext: string;
  try {
    plaintext = config.crypto.decrypt(row.ciphertext, config.previousKey);
  } catch {
    return "unreadable";
  }
  const nextCiphertext = config.crypto.encrypt(plaintext, config.key);
  const applied = await store.updateConditional(config.target, row.id, row.ciphertext, nextCiphertext);
  return applied ? "rewrapped" : "skipped";
}

export async function rewrapColumn(store: RewrapStore, config: RewrapTargetConfig): Promise<RewrapCounts> {
  const counts = emptyCounts();
  for await (const row of store.scan(config.target)) {
    counts.scanned += 1;
    const outcome = await rewrapRow(store, config, row);
    counts[outcome] += 1;
  }
  return counts;
}

export interface RewrapKeys {
  nauttKey: Buffer;
  nauttPreviousKey?: Buffer;
  totpKey: Buffer;
  totpPreviousKey?: Buffer;
}

export interface RewrapCryptoModules {
  nautt: RewrapCrypto;
  totp: RewrapCrypto;
}

export interface RewrapReport extends RewrapCounts {
  table: "nautt_credential" | "totp_credential";
}

/**
 * Rewraps the three ciphertext columns (nautt_credential.encrypted_api_key,
 * nautt_credential.encrypted_webhook_secret, totp_credential.encrypted_secret)
 * regardless of webhook_registration_state, and reports counts grouped per
 * table. Never touches any other column.
 */
export async function runRewrap(store: RewrapStore, keys: RewrapKeys, crypto: RewrapCryptoModules): Promise<RewrapReport[]> {
  const nauttApiKey = await rewrapColumn(store, {
    target: "nautt_api_key",
    crypto: crypto.nautt,
    key: keys.nauttKey,
    previousKey: keys.nauttPreviousKey,
  });
  const nauttWebhookSecret = await rewrapColumn(store, {
    target: "nautt_webhook_secret",
    crypto: crypto.nautt,
    key: keys.nauttKey,
    previousKey: keys.nauttPreviousKey,
  });
  const totpSecret = await rewrapColumn(store, {
    target: "totp_secret",
    crypto: crypto.totp,
    key: keys.totpKey,
    previousKey: keys.totpPreviousKey,
  });
  return [
    { table: "nautt_credential", ...mergeCounts(nauttApiKey, nauttWebhookSecret) },
    { table: "totp_credential", ...totpSecret },
  ];
}

/** Throws when any report recorded a row unreadable under every configured key. */
export function assertNoUnreadableRows(reports: RewrapReport[]): void {
  const failed = reports.filter((report) => report.unreadable > 0);
  if (failed.length > 0) {
    throw new Error(`unreadable rows found in: ${failed.map((report) => report.table).join(", ")}`);
  }
}
