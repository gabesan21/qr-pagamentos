import { cookies } from "next/headers";

import { ForbiddenError, getAuthorizationService, UnauthenticatedError } from "@/auth/authorization";
import {
  CurrencyPairProbeCodeInvalidError,
  CurrencyPairProbeThrottledError,
  probeCurrencyPair,
} from "@/auth/currency-pair-verification";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";

// 13.4.1 F02: merchant-only, self-keyed reachability probe for one owned
// currency pair — one `POST /pricing/panel/buy` call, never an order, never
// `deposit_fields`. `src/observability/server-request-log.ts` (the shared
// `withServerRequestLog`/`serverRequestRoutes` route registry) is outside
// this front's write set, so this route intentionally does not add itself
// there; every other `/storefront` convention still applies: cross-origin
// guard, cookie principal, form POST, relative redirect with a redacted
// notice parameter — no provider text and no UUID leaves this handler.
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  try {
    const actor = await getAuthorizationService().requireUser((await cookies()).get("qr_session")?.value);
    const code = (await request.formData()).get("code");
    const result = await probeCurrencyPair(actor, code);
    return relativeRedirect(`/settings?currency-probe=${result.outcome === "ok" ? "ok" : "refused"}#settings-currency`);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    if (error instanceof CurrencyPairProbeThrottledError) return relativeRedirect("/settings?currency-probe=throttled#settings-currency");
    if (error instanceof CurrencyPairProbeCodeInvalidError) return relativeRedirect("/settings?currency-probe=invalid#settings-currency");
    return relativeRedirect("/settings?currency-probe=failed#settings-currency");
  }
}
