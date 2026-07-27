import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPublicOrigin, loadSmtpConfig, MailConfigError } from "./mail-config";

const envKeys = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "SMTP_TLS_MODE",
  "PUBLIC_ORIGIN",
] as const;

type EnvKey = (typeof envKeys)[number];

const original: Record<EnvKey, string | undefined> = {
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  SMTP_FROM: undefined,
  SMTP_TLS_MODE: undefined,
  PUBLIC_ORIGIN: undefined,
};

beforeEach(() => {
  for (const key of envKeys) {
    original[key] = process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function setValidSmtp() {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "user@example.com";
  process.env.SMTP_PASSWORD = "secret";
  process.env.SMTP_FROM = "noreply@example.com";
  process.env.SMTP_TLS_MODE = "starttls";
}

describe("loadSmtpConfig", () => {
  it("loads and canonicalizes a valid configuration", () => {
    setValidSmtp();
    expect(loadSmtpConfig()).toEqual({
      host: "smtp.example.com",
      port: 587,
      user: "user@example.com",
      password: "secret",
      from: "noreply@example.com",
      tlsMode: "starttls",
    });
  });

  it("accepts all TLS modes", () => {
    setValidSmtp();
    for (const mode of ["none", "starttls", "tls"] as const) {
      process.env.SMTP_TLS_MODE = mode;
      expect(loadSmtpConfig().tlsMode).toBe(mode);
    }
  });

  it("trims whitespace from string fields", () => {
    process.env.SMTP_HOST = "  smtp.example.com  ";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "  user@example.com  ";
    process.env.SMTP_PASSWORD = "  secret  ";
    process.env.SMTP_FROM = "  NoReply@Example.com  ";
    process.env.SMTP_TLS_MODE = "tls";
    const config = loadSmtpConfig();
    expect(config.host).toBe("smtp.example.com");
    expect(config.user).toBe("user@example.com");
    expect(config.password).toBe("secret");
    expect(config.from).toBe("noreply@example.com");
  });

  it.each([
    ["missing host", { SMTP_HOST: undefined }],
    ["empty host", { SMTP_HOST: "" }],
    ["whitespace host", { SMTP_HOST: "   " }],
    ["missing port", { SMTP_PORT: undefined }],
    ["empty port", { SMTP_PORT: "" }],
    ["whitespace port", { SMTP_PORT: "   " }],
    ["missing user", { SMTP_USER: undefined }],
    ["empty user", { SMTP_USER: "" }],
    ["missing password", { SMTP_PASSWORD: undefined }],
    ["empty password", { SMTP_PASSWORD: "" }],
    ["missing from", { SMTP_FROM: undefined }],
    ["empty from", { SMTP_FROM: "" }],
    ["missing TLS mode", { SMTP_TLS_MODE: undefined }],
    ["empty TLS mode", { SMTP_TLS_MODE: "" }],
  ])("rejects %s", (_name, overrides) => {
    setValidSmtp();
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value as string;
    }
    expect(() => loadSmtpConfig()).toThrow(MailConfigError);
    expect(() => loadSmtpConfig()).toThrowError("SMTP configuration is invalid");
  });

  it.each([
    "0",
    "65536",
    "abc",
    "12.34",
    "01234",
    "-1",
    "587 ",
    " 587",
  ])("rejects invalid port %s", (port) => {
    setValidSmtp();
    process.env.SMTP_PORT = port;
    expect(() => loadSmtpConfig()).toThrow(MailConfigError);
  });

  it.each(["off", "STARTTLS", "ssl", "tls ", " auto"])("rejects invalid TLS mode %s", (mode) => {
    setValidSmtp();
    process.env.SMTP_TLS_MODE = mode;
    expect(() => loadSmtpConfig()).toThrow(MailConfigError);
  });

  it.each([
    "not-an-email",
    "@example.com",
    "user@",
    "user@example",
    "user@.example.com",
    "user..name@example.com",
  ])("rejects invalid from address %s", (from) => {
    setValidSmtp();
    process.env.SMTP_FROM = from;
    expect(() => loadSmtpConfig()).toThrow(MailConfigError);
  });
});

describe("loadPublicOrigin", () => {
  it("loads and canonicalizes a valid HTTPS origin", () => {
    process.env.PUBLIC_ORIGIN = "https://payments.example.com";
    expect(loadPublicOrigin()).toBe("https://payments.example.com/");
  });

  it("trims whitespace", () => {
    process.env.PUBLIC_ORIGIN = "  https://payments.example.com  ";
    expect(loadPublicOrigin()).toBe("https://payments.example.com/");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["not a URL", "not-a-url"],
    ["HTTP", "http://payments.example.com"],
    ["with credentials", "https://user:pass@payments.example.com"],
    ["with fragment", "https://payments.example.com#section"],
  ])("rejects %s", (_name, value) => {
    if (value === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = value;
    expect(() => loadPublicOrigin()).toThrow(MailConfigError);
    expect(() => loadPublicOrigin()).toThrowError("Public origin configuration is invalid");
  });
});
