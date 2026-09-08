import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getOrderCommentV2Service, getOrderLocalOutcomeV2Service } from "@/orders/order-engagement-v2";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.orderV2 }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const id = (await params).id;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      const action = form.get("action");
      let outcome: string;
      if (action === "append-comment") {
        await getOrderCommentV2Service().append(actor, id, form.get("body"));
        outcome = "commented";
      } else if (action === "edit-comment") {
        await getOrderCommentV2Service().edit(actor, form.get("commentId"), form.get("commentVersion"), form.get("body"));
        outcome = "comment-edited";
      } else if (action === "set-outcome") {
        await getOrderLocalOutcomeV2Service().append(actor, id, form.get("version"), form.get("outcome"), form.get("note"));
        outcome = "outcome-set";
      } else {
        return relativeRedirect(`/orders/v2/${id}?orders-v2=failed`);
      }
      return relativeRedirect(`/orders/v2/${id}?orders-v2=${outcome}`);
    } catch (error) {
      return ownerProtectedMutationResponse(error) ?? relativeRedirect(`/orders/v2/${id}?orders-v2=failed`);
    }
  });
}
