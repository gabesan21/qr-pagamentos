import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireOwnerFromCookie, ownerProtectedMutationResponse, appendComment, editComment, appendOutcome } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  ownerProtectedMutationResponse: vi.fn(),
  appendComment: vi.fn(),
  editComment: vi.fn(),
  appendOutcome: vi.fn(),
}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/orders/order-engagement-v2", () => ({
  getOrderCommentV2Service: () => ({ append: appendComment, edit: editComment }),
  getOrderLocalOutcomeV2Service: () => ({ append: appendOutcome }),
}));
import { POST } from "./route";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };
const params = Promise.resolve({ id: "440e8400-e29b-41d4-a716-446655440044" });

function request(body: URLSearchParams) {
  return new Request("http://local/orders-v2/440e8400-e29b-41d4-a716-446655440044", { method: "POST", headers: sameOrigin, body });
}

describe("owner order-v2 engagement route", () => {
  it("re-authorizes before form parsing on every action", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 403 }));
    const deniedRequest = request(new URLSearchParams({ action: "append-comment" }));
    const formData = vi.spyOn(deniedRequest, "formData");
    const protectedResponse = await POST(deniedRequest, { params });
    expect(protectedResponse.status).toBe(403);
    expect(await protectedResponse.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(appendComment).not.toHaveBeenCalled();
  });

  it("dispatches append-comment to the comment service with the route order identity", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    appendComment.mockResolvedValue({ id: "comment" });

    const response = await POST(request(new URLSearchParams({ action: "append-comment", body: "Primeira nota" })), { params });
    expect(appendComment).toHaveBeenCalledWith(owner, "440e8400-e29b-41d4-a716-446655440044", "Primeira nota");
    expect(response.headers.get("location")).toBe("/orders?orders-v2=commented");
  });

  it("dispatches edit-comment with the supplied comment identity and version", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    editComment.mockResolvedValue({ id: "comment" });

    const response = await POST(request(new URLSearchParams({ action: "edit-comment", commentId: "550e8400-e29b-41d4-a716-446655440055", commentVersion: "0", body: "Revisada" })), { params });
    expect(editComment).toHaveBeenCalledWith(owner, "550e8400-e29b-41d4-a716-446655440055", "0", "Revisada");
    expect(response.headers.get("location")).toBe("/orders?orders-v2=comment-edited");
  });

  it("dispatches set-outcome to the local-outcome service", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    appendOutcome.mockResolvedValue({ id: "outcome" });

    const response = await POST(request(new URLSearchParams({ action: "set-outcome", version: "3", outcome: "LOCAL_CANCELLED", note: "Cliente desistiu" })), { params });
    expect(appendOutcome).toHaveBeenCalledWith(owner, "440e8400-e29b-41d4-a716-446655440044", "3", "LOCAL_CANCELLED", "Cliente desistiu");
    expect(response.headers.get("location")).toBe("/orders?orders-v2=outcome-set");
  });

  it("maps unknown actions and service failures to the opaque failed redirect", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);

    const unknown = await POST(request(new URLSearchParams({ action: "delete" })), { params });
    expect(unknown.headers.get("location")).toBe("/orders?orders-v2=failed");

    appendOutcome.mockRejectedValueOnce(new Error("conflict"));
    const failed = await POST(request(new URLSearchParams({ action: "set-outcome", version: "3", outcome: "LOCAL_FINALIZED" })), { params });
    expect(failed.headers.get("location")).toBe("/orders?orders-v2=failed");
  });
});
