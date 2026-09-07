// Closed-allowlist return-path resolution for /language-preference: the shell language
// switcher posts from either /settings or / and expects the redirect to land back on
// the same page. The host is validated exactly as rejectCrossOrigin validates Origin
// (first X-Forwarded-Host, else Host), and the referer's query/fragment are discarded,
// so an attacker-controlled Referer can never move the redirect off the closed
// { /settings, / } allowlist — anything absent, unparseable, foreign-scheme,
// foreign-host, or unlisted falls back to "/".
const ALLOWED_RETURN_PATHS = new Set<string>(["/settings", "/"]);

export function resolveSettingsReturnTarget(request: Request): "/settings" | "/" {
  const referer = request.headers.get("referer");
  if (!referer) return "/";

  let refererUrl: URL;
  try {
    refererUrl = new URL(referer);
  } catch {
    return "/";
  }
  if (refererUrl.protocol !== "http:" && refererUrl.protocol !== "https:") return "/";

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const expectedHost = forwardedHost || request.headers.get("host");
  if (!expectedHost || refererUrl.host !== expectedHost.toLowerCase()) return "/";

  return ALLOWED_RETURN_PATHS.has(refererUrl.pathname) ? (refererUrl.pathname as "/settings" | "/") : "/";
}
