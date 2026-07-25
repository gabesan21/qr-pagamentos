import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { getMediaService } from "@/media/media-service";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export const dynamic = "force-dynamic";

// One product image is at most 5 MiB; the multipart envelope may add only a
// small bounded overhead. Anything larger is rejected before any decode.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function unavailable(): Response {
  return new Response(null, { status: 422, headers: NO_STORE_HEADERS });
}

function staged(identifier: string): Response {
  return new Response(JSON.stringify({ identifier }), {
    status: 200,
    headers: { ...NO_STORE_HEADERS, "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  return withServerRequestLog(
    request.headers.get("x-request-id"),
    { method: "POST", route: serverRequestRoutes.productImages },
    async () => {
      const crossOrigin = rejectCrossOrigin(request);
      if (crossOrigin) return crossOrigin;
      try {
        const actor = await requireOwnerFromCookie();
        const contentLength = Number(request.headers.get("content-length"));
        if (!Number.isInteger(contentLength) || contentLength <= 0 || contentLength > MAX_BODY_BYTES) {
          return unavailable();
        }
        const form = await request.formData();
        const image = form.get("image");
        if (!(image instanceof File) || image.size === 0 || image.size > MAX_IMAGE_BYTES) {
          return unavailable();
        }
        const bytes = new Uint8Array(await image.arrayBuffer());
        const record = await getMediaService().create(actor, "PRODUCT_IMAGE", bytes);
        return staged(record.identifier);
      } catch (error) {
        const protectedResponse = ownerProtectedMutationResponse(error);
        if (protectedResponse) return protectedResponse;
        return unavailable();
      }
    },
  );
}
