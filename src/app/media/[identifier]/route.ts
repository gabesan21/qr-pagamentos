import { cookies } from "next/headers";

import { getAuthorizationService } from "@/auth/authorization";
import { getMediaService } from "@/media/media-service";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function unavailable(): Response {
  return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
}

function available(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Disposition": "inline",
      "Content-Length": String(bytes.length),
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: Promise<{ identifier: string }> }>,
) {
  try {
    const identifier = (await params).identifier;
    const media = getMediaService();
    const publicRead = await media.readPublic(identifier);
    if (publicRead) return available(publicRead.bytes);

    const principal = await getAuthorizationService().resolve((await cookies()).get("qr_session")?.value);
    if (!principal || principal.role !== "USER") return unavailable();
    const ownerRead = await media.readForOwner(principal, identifier);
    return ownerRead ? available(ownerRead.bytes) : unavailable();
  } catch {
    return unavailable();
  }
}
