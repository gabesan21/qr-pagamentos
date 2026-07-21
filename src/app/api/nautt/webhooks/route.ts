import { declaredWebhookBodyTooLarge, readBoundedWebhookBody } from "../../../../integrations/nautt/bounded-webhook-body";
import { handleNauttWebhook } from "../../../../integrations/nautt/webhook-runtime";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

function empty(status: 204 | 400 | 401 | 413 | 503): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.nauttWebhook }, async () => {
    if (declaredWebhookBodyTooLarge(request.headers.get("content-length"))) {
      await request.body?.cancel("webhook body too large").catch(() => undefined);
      return empty(413);
    }
    let bounded;
    try {
      bounded = await readBoundedWebhookBody(request.body);
    } catch {
      return empty(503);
    }
    if (bounded.kind === "too-large") return empty(413);
    try {
      const result = await handleNauttWebhook({
        rawBody: bounded.body,
        signature: request.headers.get("x-nautt-signature"),
        delivery: request.headers.get("x-nautt-delivery"),
        event: request.headers.get("x-nautt-event"),
      });
      return empty(result.status);
    } catch {
      return empty(503);
    }
  });
}
