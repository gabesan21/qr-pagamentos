import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAcceptableOperatorOrigin } from "./local-origin";

const original: { ALLOW_LOOPBACK_OPERATOR_ORIGINS: string | undefined } = {
  ALLOW_LOOPBACK_OPERATOR_ORIGINS: undefined,
};

beforeEach(() => {
  original.ALLOW_LOOPBACK_OPERATOR_ORIGINS = process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (original.ALLOW_LOOPBACK_OPERATOR_ORIGINS === undefined) delete process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
  else process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS = original.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
});

describe("isAcceptableOperatorOrigin", () => {
  it("accepts HTTPS on any host", () => {
    expect(isAcceptableOperatorOrigin(new URL("https://payments.example.com"))).toBe(true);
  });

  it("rejects credentials or a fragment on any accepted scheme/host", () => {
    expect(isAcceptableOperatorOrigin(new URL("https://user:pass@payments.example.com"))).toBe(false);
    expect(isAcceptableOperatorOrigin(new URL("https://payments.example.com#section"))).toBe(false);
    expect(isAcceptableOperatorOrigin(new URL("http://localhost#section"))).toBe(false);
  });

  it("rejects plain HTTP on a non-loopback host", () => {
    expect(isAcceptableOperatorOrigin(new URL("http://payments.example.com"))).toBe(false);
  });

  it.each(["http://localhost", "http://127.0.0.1", "http://[::1]"])(
    "accepts loopback HTTP %s outside production",
    (value) => {
      vi.stubEnv("NODE_ENV", undefined);
      expect(isAcceptableOperatorOrigin(new URL(value))).toBe(true);
    },
  );

  it("refuses a loopback HTTP origin in production without the allowance", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
    expect(isAcceptableOperatorOrigin(new URL("http://localhost"))).toBe(false);
  });

  it("accepts a loopback HTTP origin in production with the allowance set to exactly 1", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS = "1";
    expect(isAcceptableOperatorOrigin(new URL("http://localhost"))).toBe(true);
  });

  it.each(["true", "0", "", "   ", "1x"])(
    "treats allowance value %j as absent in production",
    (value) => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS = value;
      expect(isAcceptableOperatorOrigin(new URL("http://localhost"))).toBe(false);
    },
  );

  it("still trims surrounding whitespace before the exact-1 comparison", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS = " 1 ";
    expect(isAcceptableOperatorOrigin(new URL("http://localhost"))).toBe(true);
  });

  it("keeps HTTPS unaffected by production and the allowance", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
    expect(isAcceptableOperatorOrigin(new URL("https://payments.example.com"))).toBe(true);
    expect(isAcceptableOperatorOrigin(new URL("https://localhost"))).toBe(true);
  });
});
