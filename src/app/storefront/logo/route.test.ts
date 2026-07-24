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
const identifier = "l".repeat(43);

function request(file: { name: string; type: string; bytes: Uint8Array } | null, headers: HeadersInit = sameOrigin) {
  const form = new FormData();
  if (file) form.set("logo", new File([file.bytes as unknown as BlobPart], file.name, { type: file.type }));
  return new Request("http://local/storefront/logo", { method: "POST", headers, body: form });
}

const png = { name: "logo.png", type: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) };

describe("owner storefront logo route", () => {
  it("rejects missing and mismatched Origin before authorization, parsing, or media work", async () => {
    for (const headers of [{ host: "local" }, { origin: "https://evil.example", host: "local" }] as Record<string, string>[]) {
      requireOwnerFromCookie.mockClear();
      create.mockClear();

      const response = await POST(request(png, headers));

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(requireOwnerFromCookie).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("re-authorizes before form parsing and maps protected outcomes to empty responses", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const deniedRequest = request(png);
    const formData = vi.spyOn(deniedRequest, "formData");
    const protectedResponse = await POST(deniedRequest);
    expect(protectedResponse.status).toBe(401);
    expect(await protectedResponse.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("stages a STOREFRONT_LOGO for the actor and redirects with the opaque identifier", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    create.mockResolvedValue({ identifier });

    const response = await POST(request(png));

    expect(create).toHaveBeenCalledWith(owner, "STOREFRONT_LOGO", expect.any(Uint8Array));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/settings?storefront-logo=staged&logo=${identifier}`);
  });

  it("returns the opaque failed redirect for a missing, empty, oversized, or rejected file without echoing detail", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    create.mockClear();

    const missing = await POST(request(null));
    expect(missing.headers.get("location")).toBe("/settings?storefront-logo=failed");

    const empty = await POST(request({ ...png, bytes: new Uint8Array() }));
    expect(empty.headers.get("location")).toBe("/settings?storefront-logo=failed");

    const oversized = await POST(request({ ...png, bytes: new Uint8Array(5 * 1024 * 1024 + 1) }));
    expect(oversized.headers.get("location")).toBe("/settings?storefront-logo=failed");
    expect(create).not.toHaveBeenCalled();

    create.mockRejectedValueOnce(new Error("quota exceeded — internal detail"));
    const rejected = await POST(request(png));
    expect(rejected.headers.get("location")).toBe("/settings?storefront-logo=failed");
    expect(await rejected.text()).toBe("");
  });
});
