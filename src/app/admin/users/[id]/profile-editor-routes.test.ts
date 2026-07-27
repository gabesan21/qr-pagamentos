import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireAdminFromCookie, protectedMutationResponse, updateIdentity, updateLocale, updateCheckoutPolicy, updateStorefront } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  protectedMutationResponse: vi.fn(),
  updateIdentity: vi.fn(),
  updateLocale: vi.fn(),
  updateCheckoutPolicy: vi.fn(),
  updateStorefront: vi.fn(),
}));

vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/admin-user-profile", async (importActual) => ({
  ...(await importActual<typeof import("@/auth/admin-user-profile")>()),
  getAdminUserProfileService: () => ({ updateIdentity, updateLocale, updateCheckoutPolicy, updateStorefront }),
}));

import { AdminUserProfileConflictError, AdminUserProfileUnavailableError, AdminUserProfileValidationError } from "@/auth/admin-user-profile";

import { POST as checkoutPolicy } from "./checkout-policy/route";
import { POST as identity } from "./identity/route";
import { POST as locale } from "./locale/route";
import { POST as storefront } from "./storefront/route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const targetId = "440e8400-e29b-41d4-a716-446655440010";
const target = { params: Promise.resolve({ id: targetId }) };
const request = (path: string, body = new URLSearchParams(), headers: Record<string, string> = { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" }) =>
  new Request(`http://0.0.0.0:3000/admin/users/${targetId}/${path}`, { method: "POST", headers, body });

const handlers = [
  ["identity", identity, new URLSearchParams({ username: "new.name", email: "new@example.com", expectedVersion: "4" }), updateIdentity],
  ["locale", locale, new URLSearchParams({ locale: "en" }), updateLocale],
  ["checkout-policy", checkoutPolicy, new URLSearchParams({ policy: "NAME_EMAIL" }), updateCheckoutPolicy],
  ["storefront", storefront, new URLSearchParams({ storefrontSlug: "padaria", storefrontEnabled: "true" }), updateStorefront],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminFromCookie.mockResolvedValue(actor);
  protectedMutationResponse.mockReturnValue(null);
});

describe("administrator profile editor route contract", () => {
  it.each(handlers)("rejects cross-origin and missing-Origin posts for %s before any auth or service work", async (path, handler, form, mutation) => {
    for (const headers of [{ host: "0.0.0.0:3000" }, { origin: "https://evil.example", host: "0.0.0.0:3000" }] as Record<string, string>[]) {
      const response = await handler(request(path, form, headers), target);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
    }
    expect(requireAdminFromCookie).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each(handlers)("returns empty 401 and 403 for %s without parsing input", async (path, handler, form, mutation) => {
    for (const [statusCode, error] of [[401, "unauthenticated"], [403, "forbidden"]] as const) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error(error));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status: statusCode }));
      const deniedRequest = request(path, form);
      const formData = vi.spyOn(deniedRequest, "formData");

      const response = await handler(deniedRequest, target);

      expect(response.status).toBe(statusCode);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("www-authenticate")).toBeNull();
      expect(formData).not.toHaveBeenCalled();
      expect(mutation).not.toHaveBeenCalled();
    }
  });

  it("updates identity through the re-authorized principal and redirects to the editor notice", async () => {
    updateIdentity.mockResolvedValue(undefined);
    const response = await identity(request("identity", new URLSearchParams({ username: "new.name", email: "new@example.com", expectedVersion: "4", actorId: "attacker" })), target);
    expect(updateIdentity).toHaveBeenCalledWith(actor, targetId, { username: "new.name", email: "new@example.com", expectedVersion: "4" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/admin/accounts/${targetId}?editor=changed`);
  });

  it("updates locale, checkout policy, and storefront through the re-authorized principal", async () => {
    updateLocale.mockResolvedValue(undefined);
    updateCheckoutPolicy.mockResolvedValue(undefined);
    updateStorefront.mockResolvedValue(undefined);

    const localeResponse = await locale(request("locale", new URLSearchParams({ locale: "pt-BR" })), target);
    expect(updateLocale).toHaveBeenCalledWith(actor, targetId, { locale: "pt-BR" });
    expect(localeResponse.headers.get("location")).toBe(`/admin/accounts/${targetId}?editor=changed`);

    const policyResponse = await checkoutPolicy(request("checkout-policy", new URLSearchParams({ policy: "EMAIL" })), target);
    expect(updateCheckoutPolicy).toHaveBeenCalledWith(actor, targetId, { policy: "EMAIL" });
    expect(policyResponse.headers.get("location")).toBe(`/admin/accounts/${targetId}?editor=changed`);

    const storefrontResponse = await storefront(request("storefront", new URLSearchParams({
      storefrontSlug: "padaria",
      storefrontDisplayNamePtBr: "Padaria",
      storefrontDisplayNameEn: "Bakery",
      storefrontAccentColor: "#A1B2C3",
      storefrontEnabled: "true",
      storefrontThemeId: "pix-paper",
      storefrontLayout: "boxed",
      storefrontStandalonePaymentsEnabled: "true",
      storefrontDefaultCurrencyCode: "BRL",
      storefrontLogoMediaIdentifier: "forged-logo-identifier",
    })), target);
    expect(updateStorefront).toHaveBeenCalledWith(actor, targetId, {
      storefrontSlug: "padaria",
      storefrontDisplayNamePtBr: "Padaria",
      storefrontDisplayNameEn: "Bakery",
      storefrontAccentColor: "#A1B2C3",
      storefrontEnabled: "true",
      storefrontThemeId: "pix-paper",
      storefrontLayout: "boxed",
      storefrontStandalonePaymentsEnabled: "true",
      storefrontDefaultCurrencyCode: "BRL",
    });
    expect(storefrontResponse.headers.get("location")).toBe(`/admin/accounts/${targetId}?editor=changed`);
  });

  it.each([handlers[0], handlers[3]])("maps a conflict for %s to the conflict notice", async (path, handler, form, mutation) => {
    mutation.mockRejectedValueOnce(new AdminUserProfileConflictError("conflict"));
    const response = await handler(request(path, form), target);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/admin/accounts/${targetId}?editor=conflict`);
  });

  it.each(handlers)("shares one opaque failure notice for %s across validation, unavailable, and deleted targets", async (path, handler, form, mutation) => {
    for (const cause of [new AdminUserProfileValidationError("invalid"), new AdminUserProfileUnavailableError("deleted"), new Error("unknown")]) {
      mutation.mockRejectedValueOnce(cause);
      const response = await handler(request(path, form), target);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`/admin/accounts/${targetId}?editor=failed`);
    }
  });
});
