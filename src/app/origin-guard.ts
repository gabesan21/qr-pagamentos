// Fail-closed same-origin check for cookie-authenticated form POSTs: defense-in-depth
// on top of the SameSite=Lax session cookie, in the same empty-403 family as
// ownerProtectedMutationResponse/protectedMutationResponse. Modern browsers always send
// Origin on POST, so a missing, malformed, or mismatched Origin is rejected before any
// auth or service work. The Nautt webhook and the sessionless public checkout APIs have
// no browser Origin and never use this guard.
export function rejectCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return crossOriginRejection();
  let originHost: string;
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return crossOriginRejection();
    originHost = originUrl.host;
  } catch {
    return crossOriginRejection();
  }
  // Behind the TLS reverse proxy the public host arrives as the first X-Forwarded-Host
  // value and Host may hold the internal bind address; direct traffic uses Host.
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const expectedHost = forwardedHost || request.headers.get("host");
  if (!expectedHost || originHost !== expectedHost.toLowerCase()) return crossOriginRejection();
  return null;
}

function crossOriginRejection() {
  return new Response(null, { status: 403 });
}
