import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieGet, readForOwner, readPublic, resolvePrincipal } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  readForOwner: vi.fn(),
  readPublic: vi.fn(),
  resolvePrincipal: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock("@/auth/authorization", () => ({
  getAuthorizationService: () => ({ resolve: resolvePrincipal }),
}));
vi.mock("@/media/media-service", () => ({
  getMediaService: () => ({ readPublic, readForOwner }),
}));

import { GET } from "./route";

const identifier = "a".repeat(43);
const owner = {
  id: "owner",
  username: "merchant",
  email: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: new Date(),
};

async function request(target = identifier) {
  return GET(new Request(`https://example.test/media/${target}`), {
    params: Promise.resolve({ identifier: target }),
  });
}

describe("GET /media/[identifier]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieGet.mockReturnValue(undefined);
    readPublic.mockResolvedValue(null);
    readForOwner.mockResolvedValue(null);
    resolvePrincipal.mockResolvedValue(null);
  });

  it("serves descriptor-verified active bytes without session work", async () => {
    readPublic.mockResolvedValue({ bytes: Buffer.from("webp"), identifier, revision: BigInt(2) });
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("content-length")).toBe("4");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("webp");
    expect(resolvePrincipal).not.toHaveBeenCalled();
  });

  it("allows a re-authorized merchant owner to read protected states", async () => {
    cookieGet.mockReturnValue({ value: "session" });
    resolvePrincipal.mockResolvedValue(owner);
    readForOwner.mockResolvedValue({ bytes: Buffer.from("owner"), identifier, revision: BigInt(4) });
    const response = await request();
    expect(response.status).toBe(200);
    expect(readForOwner).toHaveBeenCalledWith(owner, identifier);
  });

  it.each([
    ["malformed", null],
    [identifier, null],
    [identifier, { ...owner, role: "ADMIN" }],
  ])("returns one empty no-store 404 for unavailable %s", async (target, principal) => {
    resolvePrincipal.mockResolvedValue(principal);
    const response = await request(target);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect([...response.headers]).toEqual([["cache-control", "no-store"]]);
  });

  it("does not serve a publicly revoked revision and falls back only to its owner", async () => {
    cookieGet.mockReturnValue({ value: "session" });
    resolvePrincipal.mockResolvedValue(owner);
    readPublic.mockResolvedValue(null);
    readForOwner.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
  });

  it("keeps infrastructure failures empty and no-store", async () => {
    readPublic.mockRejectedValueOnce(new Error("storage unavailable"));
    const response = await request();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });
});
