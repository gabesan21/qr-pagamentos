import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock("@/auth/public-payment-link", () => ({ getPublicPaymentLinkService: () => ({ read }) }));

import { dynamic, GET } from "./route";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const paymentLink = {
  product: { title: "Donation", description: "Support the project.", price: "0.000001" },
  currencyPair: {
    currencyUuid: "11111111-1111-1111-1111-111111111111",
    exchangeCurrencyUuid: "22222222-2222-2222-2222-222222222222",
  },
};

function request(acceptLanguage?: string) {
  return new Request(`https://example.test/api/payment-links/${identifier}?ignored=value`, {
    headers: {
      ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
      cookie: "qr_session=must-not-be-read",
    },
  });
}

function context(value = identifier) {
  return { params: Promise.resolve({ identifier: value }) };
}

describe("GET /api/payment-links/[identifier]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a forced-dynamic, unlocalized public read that returns the exact DTO with no-store", async () => {
    read.mockResolvedValueOnce(paymentLink);

    const response = await GET(request("en-US,en;q=0.9"), context());

    expect(dynamic).toBe("force-dynamic");
    expect(read).toHaveBeenCalledWith(identifier, "en");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual(paymentLink);
  });

  it("uses the closed Accept-Language negotiation and its default when the header is absent", async () => {
    read.mockResolvedValue(paymentLink);

    await GET(request("pt-PT, en;q=0.2"), context());
    await GET(request(), context());

    expect(read).toHaveBeenNthCalledWith(1, identifier, "pt-BR");
    expect(read).toHaveBeenNthCalledWith(2, identifier, "pt-BR");
  });

  it("maps every unavailable result to the same empty no-store 404", async () => {
    read.mockResolvedValue(null);

    for (const unavailableIdentifier of ["missing", "inactive", "expired", "product-unavailable"]) {
      const response = await GET(request("en"), context(unavailableIdentifier));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.text()).resolves.toBe("");
    }
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("does not import session, authorization, cookie, dictionary, or checkout behavior", async () => {
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

    for (const forbiddenDependency of ["cookie", "session", "authorization", "dictionary", "checkout", "provider"]) {
      expect(source.toLowerCase()).not.toContain(forbiddenDependency);
    }
  });
});
