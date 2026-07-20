import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadNauttApiBaseUrl } from "./config";

const previous = process.env.NAUTT_API_BASE_URL;

afterEach(() => {
  if (previous === undefined) delete process.env.NAUTT_API_BASE_URL;
  else process.env.NAUTT_API_BASE_URL = previous;
});

describe("loadNauttApiBaseUrl", () => {
  it("defaults to the production base URL when the ENV is unset or empty", () => {
    delete process.env.NAUTT_API_BASE_URL;
    expect(loadNauttApiBaseUrl()).toBe("https://api.nauttfinance.com/api/v2");
    process.env.NAUTT_API_BASE_URL = "";
    expect(loadNauttApiBaseUrl()).toBe("https://api.nauttfinance.com/api/v2");
  });

  it("accepts a canonical absolute HTTPS override", () => {
    process.env.NAUTT_API_BASE_URL = "https://api-stage.nauttfinance.com/api/v2";
    expect(loadNauttApiBaseUrl()).toBe("https://api-stage.nauttfinance.com/api/v2");
  });

  it.each([
    "not-a-url",
    "http://api-stage.nauttfinance.com/api/v2",
    "https://user:pass@api-stage.nauttfinance.com/api/v2",
    "https://api-stage.nauttfinance.com/api/v2#fragment",
  ])("rejects invalid value %s with a non-disclosing error", (value) => {
    process.env.NAUTT_API_BASE_URL = value;
    expect(() => loadNauttApiBaseUrl()).toThrowError("Nautt API base URL configuration is invalid");
  });
});
