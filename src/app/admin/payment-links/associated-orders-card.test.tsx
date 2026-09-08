import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";

const { queryDirectory } = vi.hoisted(() => ({ queryDirectory: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/orders/order-v2-admin-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/orders/order-v2-admin-directory")>()),
  queryAdminOrderV2Directory: (...args: unknown[]) => queryDirectory(...args),
}));

import { AssociatedOrdersCard } from "./associated-orders-card";

describe("associated orders card", () => {
  it("falls back to an empty list when the directory read throws an ordinary error", async () => {
    queryDirectory.mockRejectedValueOnce(new Error("database unavailable"));

    const markup = renderToStaticMarkup(
      await AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    );

    expect(markup).toContain(en.adminPaymentLinkOrdersCardEmpty);
  });

  it("re-throws a Next.js redirect control-flow error instead of swallowing it", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    queryDirectory.mockRejectedValueOnce(redirectError);

    await expect(
      AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    ).rejects.toBe(redirectError);
  });

  it("re-throws a Next.js not-found control-flow error instead of swallowing it", async () => {
    const notFoundError = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    queryDirectory.mockRejectedValueOnce(notFoundError);

    await expect(
      AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    ).rejects.toBe(notFoundError);
  });
});
