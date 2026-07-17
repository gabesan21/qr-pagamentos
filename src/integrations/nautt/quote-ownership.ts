import "server-only";

export type QuoteOwnershipRegistration = {
  readonly quoteUuid: string;
  readonly ownerId: string;
  readonly expiresAt: Date;
};

export type ClaimedOrderAttempt = { readonly id: string; readonly ownerId: string; readonly quoteUuid: string };
export type QuoteClaimResult = { readonly kind: "claimed"; readonly attempt: ClaimedOrderAttempt } | { readonly kind: "unavailable" };

export interface QuoteOwnershipStore {
  register(registration: QuoteOwnershipRegistration): Promise<boolean>;
  claimForCreation(input: { quoteUuid: string; ownerId: string; now: Date }): Promise<QuoteClaimResult>;
}
