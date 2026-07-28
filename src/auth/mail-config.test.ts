import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const fileEnvKeys = [
  "SMTP_HOST_FILE",
  "SMTP_PORT_FILE",
  "SMTP_USER_FILE",
  "SMTP_PASSWORD_FILE",
  "SMTP_FROM_FILE",
  "SMTP_TLS_MODE_FILE",
  "PUBLIC_ORIGIN_FILE",
] as const;

type EnvKey = (typeof envKeys)[number];
type FileEnvKey = (typeof fileEnvKeys)[number];

const original: Record<EnvKey | FileEnvKey, string | undefined> = {
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  SMTP_FROM: undefined,
  SMTP_TLS_MODE: undefined,
  PUBLIC_ORIGIN: undefined,
  SMTP_HOST_FILE: undefined,
  SMTP_PORT_FILE: undefined,
  SMTP_USER_FILE: undefined,
  SMTP_PASSWORD_FILE: undefined,
  SMTP_FROM_FILE: undefined,
  SMTP_TLS_MODE_FILE: undefined,
  PUBLIC_ORIGIN_FILE: undefined,
};

let tempDir: string | null = null;

beforeEach(() => {
  for (const key of envKeys) {
    original[key] = process.env[key];
  }
  for (const key of fileEnvKeys) {
    original[key] = process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  for (const key of fileEnvKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function makeTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), "mail-config-test-"));
  return tempDir;
}

function writeSecret(name: string, content: string): string {
  const dir = makeTempDir();
  const filePath = join(dir, name);
  writeFileSync(filePath, content, { mode: 0o600 });
  return filePath;
}

function setValidSmtp() {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "user@example.com";
  process.env.SMTP_PASSWORD = "secret";
  process.env.SMTP_FROM = "noreply@example.com";
  process.env.SMTP_TLS_MODE = "starttls";
}

function setValidSmtpFiles() {
  process.env.SMTP_HOST_FILE = writeSecret("smtp_host", "smtp.example.com");
  process.env.SMTP_PORT_FILE = writeSecret("smtp_port", "587");
  process.env.SMTP_USER_FILE = writeSecret("smtp_user", "user@example.com");
  process.env.SMTP_PASSWORD_FILE = writeSecret("smtp_password", "secret");
  process.env.SMTP_FROM_FILE = writeSecret("smtp_from", "noreply@example.com");
  process.env.SMTP_TLS_MODE_FILE = writeSecret("smtp_tls_mode", "starttls");
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

  it("loads and canonicalizes a valid file-backed configuration", () => {
    setValidSmtpFiles();
    expect(loadSmtpConfig()).toEqual({
      host: "smtp.example.com",
      port: 587,
      user: "user@example.com",
      password: "secret",
      from: "noreply@example.com",
      tlsMode: "starttls",
    });
  });

  it("prefers file-backed values over environment variables", () => {
    setValidSmtp();
    setValidSmtpFiles();
    process.env.SMTP_HOST = "env.example.com";
    process.env.SMTP_PORT = "25";
    expect(loadSmtpConfig().host).toBe("smtp.example.com");
    expect(loadSmtpConfig().port).toBe(587);
  });

  it("trims whitespace and newlines from file-backed values", () => {
    process.env.SMTP_HOST_FILE = writeSecret("smtp_host", "  smtp.example.com  ");
    process.env.SMTP_PORT_FILE = writeSecret("smtp_port", "587\n");
    process.env.SMTP_USER_FILE = writeSecret("smtp_user", "user@example.com\r\n");
    process.env.SMTP_PASSWORD_FILE = writeSecret("smtp_password", "secret");
    process.env.SMTP_FROM_FILE = writeSecret("smtp_from", "NoReply@Example.com\n");
    process.env.SMTP_TLS_MODE_FILE = writeSecret("smtp_tls_mode", "tls\n");
    const config = loadSmtpConfig();
    expect(config.host).toBe("smtp.example.com");
    expect(config.port).toBe(587);
    expect(config.user).toBe("user@example.com");
    expect(config.password).toBe("secret");
    expect(config.from).toBe("noreply@example.com");
    expect(config.tlsMode).toBe("tls");
  });

  it("falls back to environment variables when file-backed values are absent", () => {
    setValidSmtp();
    process.env.SMTP_HOST_FILE = writeSecret("smtp_host", "file.example.com");
    const config = loadSmtpConfig();
    expect(config.host).toBe("file.example.com");
    expect(config.port).toBe(587);
    expect(config.user).toBe("user@example.com");
  });

  it("rejects when a file-backed value points to a missing file", () => {
    setValidSmtp();
    delete process.env.SMTP_HOST;
    process.env.SMTP_HOST_FILE = "/tmp/does-not-exist-mail-config-test";
    expect(() => loadSmtpConfig()).toThrow(MailConfigError);
  });

  it("accepts all TLS modes", () => {
    setValidSmtp();
    for (const mode of ["none", "starttls", "tls"] as const) {
      process.env.SMTP_TLS_MODE = mode;
      expect(loadSmtpConfig().tlsMode).toBe(mode);
    }
  });

  it("accepts all TLS modes from files", () => {
    setValidSmtp();
    delete process.env.SMTP_TLS_MODE;
    for (const mode of ["none", "starttls", "tls"] as const) {
      process.env.SMTP_TLS_MODE_FILE = writeSecret("smtp_tls_mode", mode);
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

  it("loads a valid origin from a file", () => {
    process.env.PUBLIC_ORIGIN_FILE = writeSecret("public_origin", "https://payments.example.com");
    expect(loadPublicOrigin()).toBe("https://payments.example.com/");
  });

  it("prefers file-backed origin over environment variable", () => {
    process.env.PUBLIC_ORIGIN = "https://env.example.com";
    process.env.PUBLIC_ORIGIN_FILE = writeSecret("public_origin", "https://file.example.com");
    expect(loadPublicOrigin()).toBe("https://file.example.com/");
  });

  it("trims whitespace", () => {
    process.env.PUBLIC_ORIGIN = "  https://payments.example.com  ";
    expect(loadPublicOrigin()).toBe("https://payments.example.com/");
  });

  it("trims whitespace and newlines from file-backed origin", () => {
    process.env.PUBLIC_ORIGIN_FILE = writeSecret("public_origin", "\n  https://payments.example.com  \n");
    expect(loadPublicOrigin()).toBe("https://payments.example.com/");
  });

  it("rejects when the file-backed origin points to a missing file", () => {
    delete process.env.PUBLIC_ORIGIN;
    process.env.PUBLIC_ORIGIN_FILE = "/tmp/does-not-exist-public-origin-test";
    expect(() => loadPublicOrigin()).toThrow(MailConfigError);
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
