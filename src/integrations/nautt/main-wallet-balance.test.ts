import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMainWalletBalanceAdapter, MainWalletBalanceError } from "./main-wallet-balance";

const apiKey = "secret-owner-key";
const success = () => new Response(JSON.stringify({ data: {
  token_symbol: "USDT", token_name: "Tether USD", network_name: "Polygon Mainnet", balance: "17.271189",
} }), { status: 200 });

describe("main wallet balance adapter", () => {
  it("makes one exact owner-keyed GET without a user query and preserves the decimal", async () => {
    const fetch = vi.fn(async () => success());
    const createTimeoutSignal = vi.fn(() => AbortSignal.abort());
    const result = await createMainWalletBalanceAdapter({ fetch, createTimeoutSignal }).read(apiKey);
    expect(result).toEqual({ tokenSymbol: "USDT", tokenName: "Tether USD", networkName: "Polygon Mainnet", balance: "17.271189" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.nauttfinance.com/api/v2/users/wallets/main/balances", {
      method: "GET", headers: { "X-API-Key": apiKey }, signal: expect.any(AbortSignal),
    });
    expect(createTimeoutSignal).toHaveBeenCalledWith(10_000);
  });

  it("targets the validated NAUTT_API_BASE_URL override when set", async () => {
    const previous = process.env.NAUTT_API_BASE_URL;
    process.env.NAUTT_API_BASE_URL = "https://api-stage.nauttfinance.com/api/v2";
    try {
      const fetch = vi.fn(async () => success());
      await createMainWalletBalanceAdapter({ fetch }).read(apiKey);
      expect(fetch).toHaveBeenCalledWith("https://api-stage.nauttfinance.com/api/v2/users/wallets/main/balances", expect.anything());
    } finally {
      if (previous === undefined) delete process.env.NAUTT_API_BASE_URL;
      else process.env.NAUTT_API_BASE_URL = previous;
    }
  });

  it.each([
    ["non-200", async () => new Response(JSON.stringify({ apiKey }), { status: 401 })],
    ["malformed", async () => new Response("not-json", { status: 200 })],
    ["incomplete", async () => new Response(JSON.stringify({ data: { token_symbol: "USDT", balance: "1" } }), { status: 200 })],
    ["invalid decimal", async () => new Response(JSON.stringify({ data: { token_symbol: "USDT", token_name: "Tether", network_name: "Polygon", balance: "1e3" } }), { status: 200 })],
    ["timeout", async () => { throw new DOMException(`timeout ${apiKey}`, "TimeoutError"); }],
  ])("redacts %s without retry", async (_label, outcome) => {
    const fetch = vi.fn(outcome);
    const error = await createMainWalletBalanceAdapter({ fetch }).read(apiKey).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MainWalletBalanceError);
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
