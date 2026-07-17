import "server-only";

import { isExactDecimal } from "./decimal";

const PRODUCTION_BASE_URL = "https://api.nauttfinance.com/api/v2";
const DEFAULT_TIMEOUT_MS = 10_000;

export type MainWalletBalance = {
  readonly tokenSymbol: string;
  readonly tokenName: string;
  readonly networkName: string;
  readonly balance: string;
};

export class MainWalletBalanceError extends Error {
  constructor() {
    super("Main wallet balance is unavailable");
    this.name = "MainWalletBalanceError";
  }
}

type Dependencies = {
  fetch?: typeof globalThis.fetch;
  createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseBalance(payload: unknown): MainWalletBalance {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) throw new MainWalletBalanceError();
  const data = payload.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("token_symbol" in data) ||
    !("token_name" in data) ||
    !("network_name" in data) ||
    !("balance" in data) ||
    !nonEmptyString(data.token_symbol) ||
    !nonEmptyString(data.token_name) ||
    !nonEmptyString(data.network_name) ||
    !isExactDecimal(data.balance)
  ) {
    throw new MainWalletBalanceError();
  }
  return {
    tokenSymbol: data.token_symbol,
    tokenName: data.token_name,
    networkName: data.network_name,
    balance: data.balance,
  };
}

export function createMainWalletBalanceAdapter(dependencies: Dependencies = {}) {
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const createTimeoutSignal = dependencies.createTimeoutSignal ?? AbortSignal.timeout;
  return {
    async read(apiKeyCandidate: string): Promise<MainWalletBalance> {
      const apiKey = apiKeyCandidate.trim();
      if (!apiKey) throw new MainWalletBalanceError();
      try {
        const response = await fetch(`${PRODUCTION_BASE_URL}/users/wallets/main/balances`, {
          method: "GET",
          headers: { "X-API-Key": apiKey },
          signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
        });
        if (response.status !== 200) throw new MainWalletBalanceError();
        return parseBalance(await response.json());
      } catch {
        throw new MainWalletBalanceError();
      }
    },
  };
}

export function getMainWalletBalanceAdapter() {
  return createMainWalletBalanceAdapter();
}
