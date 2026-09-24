import "server-only";

import { getDatabaseClient } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { getOwnerPricingOrdersService } from "../integrations/nautt/owner-pricing-orders";
import { NauttPricingRefusedError, type NauttPricingRefusalCode, type NauttQuoteAmount } from "../integrations/nautt/pricing-orders-client";
import { ForbiddenError, requireUserPrincipal, type Principal } from "./authorization";
import { isObservedPaymentEnabled, type GlobalPaymentSettings } from "./payment-settings";
import { getSupportedExchangeCurrencyService, NoActiveExchangeCurrencyMappingError } from "./supported-exchange-currency";

// The documentation defines no minimum probe amount; its own example uses
// 500.00 (raw/pricing/calculate-buy-conversion-panel.md:18). "1.00" is the
// smallest exact two-decimal BRL value that still reads as a deliberate,
// non-zero test quote rather than a truncation artifact.
const PROBE_AMOUNT: NauttQuoteAmount = { kind: "fiat", value: "1.00" };
const PROBE_THROTTLE_MS = 60_000;

export class CurrencyPairProbeThrottledError extends Error {
  constructor() {
    super("Currency-pair probe was requested too soon");
    this.name = "CurrencyPairProbeThrottledError";
  }
}

export class CurrencyPairProbeCodeInvalidError extends Error {
  constructor() {
    super("Currency code has no active pair to probe");
    this.name = "CurrencyPairProbeCodeInvalidError";
  }
}

export class CurrencyPairSelectionRefusedError extends Error {
  constructor() {
    super("Currency pair is not selectable for this owner yet");
    this.name = "CurrencyPairSelectionRefusedError";
  }
}

export type CurrencyPairProbeOutcome = "ok" | NauttPricingRefusalCode | "unavailable";

export type CurrencyPairProbeResult = Readonly<{ outcome: CurrencyPairProbeOutcome }>;

export type CurrencyPairCodeEvidence = Readonly<{
  code: string;
  checkedAt: string | null;
  outcome: string | null;
  observedPaymentMethod: string | null;
  observedCurrencySymbol: string | null;
}>;

// Accepts either the shared client or an open transaction, so payment-link
// creation can compose the gate inside its own existing transaction
// (payment-link-v2.ts) while storefront/admin default-currency reads call it
// standalone.
type QueryClient = ReturnType<typeof getDatabaseClient> | Prisma.TransactionClient;

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

async function readGlobalPaymentSettings(client: QueryClient): Promise<GlobalPaymentSettings> {
  const settings = await client.globalPaymentSettings.findUnique({
    where: { id: 1 },
    select: { currencies: true, paymentMethods: true },
  });
  // Fail closed like `isObservedPaymentEnabled` itself: a missing singleton
  // reads as nothing enabled, never as "anything goes".
  return settings ?? { currencies: [], paymentMethods: [] };
}

// The one shared gate every selection surface reads: a passing probe
// (`quote_outcome = ok`) is required, and an observation on record that the
// current settings do not cover blocks selection even with a passing probe.
// A pair with no observation yet stays selectable on the probe alone.
export async function isSelectable(ownerId: string, pairId: string, client: QueryClient = getDatabaseClient()): Promise<boolean> {
  const [verification, settings] = await Promise.all([
    client.currencyPairVerification.findUnique({
      where: { ownerId_pairId: { ownerId, pairId } },
      select: { quoteOutcome: true, observedPaymentMethod: true, observedCurrencySymbol: true },
    }),
    readGlobalPaymentSettings(client),
  ]);
  if (!verification || verification.quoteOutcome !== "ok") return false;
  if (verification.observedPaymentMethod && verification.observedCurrencySymbol) {
    return isObservedPaymentEnabled(settings, {
      paymentMethod: verification.observedPaymentMethod,
      currencySymbol: verification.observedCurrencySymbol,
    });
  }
  return true;
}

export async function requireSelectable(ownerId: string, pairId: string, client: QueryClient = getDatabaseClient()): Promise<void> {
  if (!(await isSelectable(ownerId, pairId, client))) throw new CurrencyPairSelectionRefusedError();
}

// Storefront/admin default-currency resolution only ever holds the registry-
// resolved (currencyUuid, exchangeCurrencyUuid) pointer, never the catalog
// pair id directly, so this resolves the pair row before reading evidence.
export async function requireSelectableForCurrencyPair(
  ownerId: string,
  currencyUuid: string,
  exchangeCurrencyUuid: string,
  client: QueryClient = getDatabaseClient(),
): Promise<void> {
  const pair = await client.catalogCurrencyPair.findUnique({
    where: { currencyUuid_exchangeCurrencyUuid: { currencyUuid, exchangeCurrencyUuid } },
    select: { id: true },
  });
  if (!pair || !(await isSelectable(ownerId, pair.id, client))) throw new CurrencyPairSelectionRefusedError();
}

// Merchant-run, self-keyed reachability probe. Requires a USER principal
// (never ADMIN — roles are disjoint and a Nautt credential is strictly
// self-owned, authorization.ts:16-20 and nautt-credential.ts:63-68) and
// dispatches the owner's own quote path, one key-handling path, one
// ownership fence. Throttled per (owner, pair) to one attempt per 60s from
// the stored `quote_checked_at`, with no new limiter infrastructure.
export async function probeCurrencyPair(
  actor: Principal,
  code: unknown,
  now: () => Date = () => new Date(),
): Promise<CurrencyPairProbeResult> {
  requireUserPrincipal(actor);
  if (typeof code !== "string" || code.length === 0) throw new CurrencyPairProbeCodeInvalidError();

  let resolved: Readonly<{ currencyUuid: string; exchangeCurrencyUuid: string }>;
  try {
    resolved = await getSupportedExchangeCurrencyService().requireActivePair(code);
  } catch (error) {
    if (error instanceof NoActiveExchangeCurrencyMappingError) throw new CurrencyPairProbeCodeInvalidError();
    throw error;
  }

  const db = getDatabaseClient();
  const pair = await db.catalogCurrencyPair.findUnique({
    where: { currencyUuid_exchangeCurrencyUuid: { currencyUuid: resolved.currencyUuid, exchangeCurrencyUuid: resolved.exchangeCurrencyUuid } },
    select: { id: true },
  });
  if (!pair) throw new CurrencyPairProbeCodeInvalidError();

  const existing = await db.currencyPairVerification.findUnique({
    where: { ownerId_pairId: { ownerId: actor.id, pairId: pair.id } },
    select: { quoteCheckedAt: true },
  });
  const checkedAt = now();
  if (existing?.quoteCheckedAt && checkedAt.getTime() - existing.quoteCheckedAt.getTime() < PROBE_THROTTLE_MS) {
    throw new CurrencyPairProbeThrottledError();
  }

  let outcome: CurrencyPairProbeOutcome;
  try {
    await getOwnerPricingOrdersService().quote(actor.id, {
      currencyUuid: resolved.currencyUuid,
      exchangeCurrencyUuid: resolved.exchangeCurrencyUuid,
      amount: PROBE_AMOUNT,
    });
    outcome = "ok";
  } catch (error) {
    // Only the four documented pricing refusal codes are ever recorded; every
    // other failure (missing credential, transport failure, indeterminate
    // adapter error) is the opaque unavailable outcome and leaves the
    // previously recorded verdict, if any, untouched.
    outcome = error instanceof NauttPricingRefusedError ? error.code : "unavailable";
  }

  await db.currencyPairVerification.upsert({
    where: { ownerId_pairId: { ownerId: actor.id, pairId: pair.id } },
    create: {
      ownerId: actor.id,
      pairId: pair.id,
      quoteCheckedAt: checkedAt,
      quoteOutcome: outcome === "unavailable" ? null : outcome,
      updatedAt: checkedAt,
    },
    update: {
      quoteCheckedAt: checkedAt,
      updatedAt: checkedAt,
      ...(outcome === "unavailable" ? {} : { quoteOutcome: outcome }),
    },
  });

  return { outcome };
}

// Administrator read-only visibility (never a selection input, never an
// admin-triggered provider call): the latest evidence row across every owner
// for each registered code, redacted to outcome/method/currency/timestamps.
export async function listLatestEvidenceByCode(
  actor: Principal,
  db: ReturnType<typeof getDatabaseClient> = getDatabaseClient(),
): Promise<CurrencyPairCodeEvidence[]> {
  requireAdmin(actor);
  const mappings = await db.supportedExchangeCurrency.findMany({ select: { code: true, pairId: true } });
  if (mappings.length === 0) return [];
  const rows = await db.currencyPairVerification.findMany({
    where: { pairId: { in: mappings.map((mapping) => mapping.pairId) } },
    orderBy: { updatedAt: "desc" },
    select: { pairId: true, quoteCheckedAt: true, quoteOutcome: true, observedPaymentMethod: true, observedCurrencySymbol: true },
  });
  const latestByPair = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByPair.has(row.pairId)) latestByPair.set(row.pairId, row);
  }
  return mappings.map((mapping) => {
    const latest = latestByPair.get(mapping.pairId);
    return {
      code: mapping.code,
      checkedAt: latest?.quoteCheckedAt ? latest.quoteCheckedAt.toISOString() : null,
      outcome: latest?.quoteOutcome ?? null,
      observedPaymentMethod: latest?.observedPaymentMethod ?? null,
      observedCurrencySymbol: latest?.observedCurrencySymbol ?? null,
    };
  });
}

// Merchant read for the probe status line: this owner's own evidence row per
// registered code (never another owner's), so the settings surface can show
// last check, outcome, and observed method/currency without threading them
// through the probe route's redirect notice.
export async function listOwnerEvidenceByCode(
  actor: Principal,
  db: ReturnType<typeof getDatabaseClient> = getDatabaseClient(),
): Promise<CurrencyPairCodeEvidence[]> {
  requireUserPrincipal(actor);
  const mappings = await db.supportedExchangeCurrency.findMany({ select: { code: true, pairId: true } });
  if (mappings.length === 0) return [];
  const rows = await db.currencyPairVerification.findMany({
    where: { ownerId: actor.id, pairId: { in: mappings.map((mapping) => mapping.pairId) } },
    select: { pairId: true, quoteCheckedAt: true, quoteOutcome: true, observedPaymentMethod: true, observedCurrencySymbol: true },
  });
  const byPair = new Map(rows.map((row) => [row.pairId, row]));
  return mappings.map((mapping) => {
    const own = byPair.get(mapping.pairId);
    return {
      code: mapping.code,
      checkedAt: own?.quoteCheckedAt ? own.quoteCheckedAt.toISOString() : null,
      outcome: own?.quoteOutcome ?? null,
      observedPaymentMethod: own?.observedPaymentMethod ?? null,
      observedCurrencySymbol: own?.observedCurrencySymbol ?? null,
    };
  });
}
