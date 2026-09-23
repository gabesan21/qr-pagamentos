import "server-only";

// Redacted provider-failure writer: reuses the discipline of
// server-request-log.ts (server-only, one JSON line, console sink,
// swallow-on-failure, never alters a thrown error, a response, or a
// dispatch count). The record membership is closed by the type below:
// operation, HTTP status (or a transport-failure marker), and a code.
// A `code` must already be validated by the caller against a closed
// documented allowlist before it is passed here — this writer performs
// no parsing and no allowlist check of its own, so a caller that never
// validates a code must never pass one. Any operation that never
// resolves a documented code (no established allowlist) must call this
// writer with `code` omitted, which logs the fixed unknown marker below.
// No response body, header, request URL, API key, PIX payload, or
// customer field is a reachable member of this record.

export const providerFailureOperations = {
  quoteCreation: "quote_creation",
  onrampOrderCreation: "onramp_order_creation",
  orderRead: "order_read",
  mainWalletBalanceRead: "main_wallet_balance_read",
} as const;

export type ProviderFailureOperation = (typeof providerFailureOperations)[keyof typeof providerFailureOperations];

export type ProviderFailureStatus = number | "transport_failure";

const UNKNOWN_CODE_MARKER = "undocumented_or_absent";

type ProviderFailureRecord = Readonly<{
  timestamp: string;
  level: "error";
  event: "provider.request.failed";
  operation: ProviderFailureOperation;
  status: ProviderFailureStatus;
  code: string;
}>;

/**
 * Logs one redacted provider-failure record. `code` is logged verbatim only
 * when the caller supplies it, which must happen only after the caller
 * validated it against a closed documented allowlist for that operation;
 * every other case (omitted, absent, unparseable, undocumented) resolves to
 * the fixed unknown marker so a provider-controlled string never reaches
 * the log.
 */
export function logProviderFailure(
  operation: ProviderFailureOperation,
  status: ProviderFailureStatus,
  code?: string,
): void {
  try {
    const record: ProviderFailureRecord = {
      timestamp: new Date().toISOString(),
      level: "error",
      event: "provider.request.failed",
      operation,
      status,
      code: code ?? UNKNOWN_CODE_MARKER,
    };
    console.error(JSON.stringify(record));
  } catch {
    // Logging cannot alter a thrown error, a response, or a dispatch count.
  }
}
