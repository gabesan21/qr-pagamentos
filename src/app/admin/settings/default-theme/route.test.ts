import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireAdminFromCookie, protectedMutationResponse, saveDefaultTheme } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  protectedMutationResponse: vi.fn(),
  saveDefaultTheme: vi.fn(),
}));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/system-settings", () => ({
  getSystemSettingsService: () => ({ saveDefaultTheme }),
}));

import { POST } from "./route";

const actor = { id: "admin-id", username: "admin", email: null, role: "ADMIN", status: "ACTIVE", createdAt: new Date() };

function submit(body: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request("https://app.example.com/admin/settings/default-theme", {
    method: "POST",
    headers: { origin: "https://app.example.com", host: "app.example.com", ...headers },
    body: new URLSearchParams(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminFromCookie.mockResolvedValue(actor);
  protectedMutationResponse.mockReturnValue(null);
});

describe("admin default-theme mutation route", () => {
  it("rejects cross-origin posts before any authentication or service work", async () => {
    const response = await POST(submit({ themeId: "vault-blue" }, { origin: "https://evil.example.com" }));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(requireAdminFromCookie).not.toHaveBeenCalled();
    expect(saveDefaultTheme).not.toHaveBeenCalled();
  });

  it("returns only the protected empty outcomes for unauthenticated and non-administrator callers", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("denied"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));

      const response = await POST(submit({ themeId: "vault-blue" }));

      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
      expect(saveDefaultTheme).not.toHaveBeenCalled();
    }
  });

  it("saves the submitted theme through the cookie principal and redirects opaquely", async () => {
    const response = await POST(submit({ themeId: "vault-blue", actorId: "attacker" }));

    expect(saveDefaultTheme).toHaveBeenCalledWith(actor, "vault-blue");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/settings?success=theme-default");
  });

  it("maps validation failures to the same opaque failure redirect without value disclosure", async () => {
    saveDefaultTheme.mockRejectedValueOnce(new Error("Invalid default theme"));

    const response = await POST(submit({ themeId: "not-a-theme" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/settings?error=theme-default-failed");
    expect(await response.text()).toBe("");
  });
});
