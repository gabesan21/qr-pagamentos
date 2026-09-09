// Origin-validated return-path resolution for /language-preference: the switcher can post
// from any authenticated page and expects the redirect to land back on that exact page,
// query included. The host is validated exactly as rejectCrossOrigin validates Origin
// (first X-Forwarded-Host, else Host), so an attacker-controlled Referer can never move
// the redirect off this origin. Only the validated Referer's path and query survive — the
// fragment is dropped (the caller reattaches the "#settings-language" section anchor for a
// "/settings" return) — and the result must start with a single "/": an absent,
// unparseable, foreign-scheme, foreign-host, protocol-relative ("//…"), or otherwise
// non-path-rooted value all fall back to "/".
export function resolveSettingsReturnTarget(request: Request): `/${string}` {
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

  const target = `${refererUrl.pathname}${refererUrl.search}`;
  return target.startsWith("/") && !target.startsWith("//") ? (target as `/${string}`) : "/";
}
