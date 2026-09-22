const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Operator-configured origins must be HTTPS on every real host. Plain HTTP is
 * accepted only when the host is loopback, where the traffic never leaves the
 * machine and a certificate cannot be provisioned for local testing.
 */
export function isAcceptableOperatorOrigin(url: URL): boolean {
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
}
