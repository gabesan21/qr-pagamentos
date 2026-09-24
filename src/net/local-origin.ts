const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Fail-closed: only the exact string "1" (after trimming) counts as granted.
 * Any other value — "true", "0", empty, whitespace — counts as absent.
 */
function loopbackAllowanceGranted(): boolean {
  return (process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS ?? "").trim() === "1";
}

/**
 * Operator-configured origins must be HTTPS on every real host. Plain HTTP is
 * accepted only when the host is loopback, where the traffic never leaves the
 * machine and a certificate cannot be provisioned for local testing. In a
 * production build that loopback exception additionally requires the operator
 * to set `ALLOW_LOOPBACK_OPERATOR_ORIGINS=1`, so a real deployment misconfigured
 * with a loopback origin fails closed instead of running unprotected. This is
 * the single production decision; `assertProductionOperatorOrigin` in
 * `container/runtime.mjs` restates it for the file-backed startup preflight
 * because that wrapper cannot import this module — keep both in sync.
 */
export function isAcceptableOperatorOrigin(url: URL): boolean {
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:" || !LOOPBACK_HOSTNAMES.has(url.hostname)) return false;
  if (process.env.NODE_ENV === "production" && !loopbackAllowanceGranted()) return false;
  return true;
}
