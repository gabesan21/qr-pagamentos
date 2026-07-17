import "server-only";

export type QuoteOwnershipRegistration = {
  readonly quoteUuid: string;
  readonly ownerId: string;
  readonly expiresAt: Date;
};

export type QuoteClaimResult = "claimed" | "unavailable";

export interface QuoteOwnershipStore {
  register(registration: QuoteOwnershipRegistration): Promise<boolean>;
  claimForCreation(input: { quoteUuid: string; ownerId: string; now: Date }): Promise<QuoteClaimResult>;
}

type StoredQuote = {
  readonly ownerId: string;
  readonly expiresAtMs: number;
  consumed: boolean;
};

export function createInMemoryQuoteOwnershipStore(): QuoteOwnershipStore {
  const records = new Map<string, StoredQuote>();
  return {
    register({ quoteUuid, ownerId, expiresAt }) {
      if (records.has(quoteUuid)) return Promise.resolve(false);
      records.set(quoteUuid, { ownerId, expiresAtMs: expiresAt.getTime(), consumed: false });
      return Promise.resolve(true);
    },
    claimForCreation({ quoteUuid, ownerId, now }) {
      const record = records.get(quoteUuid);
      if (!record) return Promise.resolve("unavailable");
      if (record.ownerId !== ownerId) return Promise.resolve("unavailable");
      if (record.consumed) return Promise.resolve("unavailable");
      if (record.expiresAtMs <= now.getTime()) return Promise.resolve("unavailable");
      record.consumed = true;
      return Promise.resolve("claimed");
    },
  };
}
