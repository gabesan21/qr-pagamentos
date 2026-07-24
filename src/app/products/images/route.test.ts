import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireOwnerFromCookie, ownerProtectedMutationResponse, create } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  ownerProtectedMutationResponse: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/media/media-service", () => ({ getMediaService: () => ({ create }) }));

import { POST } from "./route";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };

async function multipartRequest(body: FormData, headers: Record<string, string> = {}) {
  const probe = new Request("http://local/products/images", { method: "POST", body });
  const payload = await probe.arrayBuffer();
  return new Request("http://local/products/images", {
    method: "POST",
    headers: {
      ...sameOrigin,
      "content-length": String(payload.byteLength),
      "content-type": probe.headers.get("content-type") ?? "",
      ...headers,
    },
    body: payload,
  });
}

function imageBody(bytes: number, name = "image") {
  const body = new FormData();
  body.set(name, new File([new Uint8Array(bytes)], "product.png", { type: "image/png" }));
  return body;
}

describe("owner product image staging route", () => {
  it("rejects cross-origin and missing-Origin posts before any auth or media work", async () => {
    for (const headers of [{ host: "local" }, { origin: "https://evil.example", host: "local" }] as Record<string, string>[]) {
      const response = await POST(new Request("http://local/products/images", { method: "POST", headers }));
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
    }
    expect(requireOwnerFromCookie).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the empty protected response before parsing the body", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const deniedRequest = await multipartRequest(imageBody(8));
    const formData = vi.spyOn(deniedRequest, "formData");
    const response = await POST(deniedRequest);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before decoding with one opaque empty outcome", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    const oversized = await multipartRequest(imageBody(6 * 1024 * 1024));
    const formData = vi.spyOn(oversized, "formData");
    const response = await POST(oversized);
    expect(response.status).toBe(422);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(formData).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a missing or oversized image part with the same opaque outcome", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    const missing = await POST(await multipartRequest(imageBody(8, "not-image")));
    expect(missing.status).toBe(422);
    expect(await missing.text()).toBe("");
    expect(create).not.toHaveBeenCalled();
  });

  it("maps media failures to the same opaque empty outcome", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    create.mockRejectedValueOnce(new Error("media unavailable"));
    const response = await POST(await multipartRequest(imageBody(8)));
    expect(response.status).toBe(422);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("stages the owner image and returns only the opaque identifier with no-store", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    create.mockResolvedValueOnce({ identifier: "a".repeat(43) });
    const response = await POST(await multipartRequest(imageBody(8)));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ identifier: "a".repeat(43) });
    expect(create).toHaveBeenCalledWith(owner, "PRODUCT_IMAGE", expect.any(Uint8Array));
  });
});
