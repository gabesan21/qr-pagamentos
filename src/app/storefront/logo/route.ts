import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getMediaService } from "@/media/media-service";
import { MAX_MEDIA_BYTES } from "@/media/types";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

// Logo staging only: the upload becomes a STAGED STOREFRONT_LOGO object and the
// redirect carries its public-safe opaque identifier; the storefront settings
// save (POST /storefront) activates it and orphans the previous logo.
export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.storefrontLogo }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      const file = form.get("logo");
      if (!(file instanceof File) || file.size === 0 || file.size > MAX_MEDIA_BYTES) {
        throw new Error("Logo upload is invalid");
      }
      const staged = await getMediaService().create(actor, "STOREFRONT_LOGO", new Uint8Array(await file.arrayBuffer()));
      return relativeRedirect(`/settings?storefront-logo=staged&logo=${staged.identifier}`);
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/settings?storefront-logo=failed");
    }
  });
}
