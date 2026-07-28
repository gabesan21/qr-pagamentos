import "server-only";

import { readFileSync } from "node:fs";

import { normalizeOptionalEmail } from "./identity.ts";

export const SMTP_TLS_MODES = ["none", "starttls", "tls"] as const;
export type SmtpTlsMode = (typeof SMTP_TLS_MODES)[number];

export type SmtpConfig = Readonly<{
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  tlsMode: SmtpTlsMode;
}>;

export class MailConfigError extends Error {}

function isBlank(value: string | undefined): value is undefined | "" {
  return value === undefined || value.trim().length === 0;
}

function readFileBackedValue(key: string): string | undefined {
  const filePath = process.env[`${key}_FILE`];
  if (isBlank(filePath)) return process.env[key];
  try {
    return readFileSync(filePath.trim(), "utf8").trim();
  } catch {
    return undefined;
  }
}

function requirePresent(value: string | undefined): string {
  if (isBlank(value)) throw new MailConfigError("SMTP configuration is invalid");
  return value.trim();
}

function hasSurroundingWhitespace(value: string): boolean {
  return value.length !== value.trim().length;
}

function parsePort(value: string | undefined): number {
  if (isBlank(value)) throw new MailConfigError("SMTP configuration is invalid");
  const raw = value as string;
  if (hasSurroundingWhitespace(raw)) throw new MailConfigError("SMTP configuration is invalid");
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== raw) {
    throw new MailConfigError("SMTP configuration is invalid");
  }
  return port;
}

function parseTlsMode(value: string | undefined): SmtpTlsMode {
  if (isBlank(value)) throw new MailConfigError("SMTP configuration is invalid");
  const raw = value as string;
  if (hasSurroundingWhitespace(raw) || !SMTP_TLS_MODES.includes(raw as SmtpTlsMode)) {
    throw new MailConfigError("SMTP configuration is invalid");
  }
  return raw as SmtpTlsMode;
}

function parseFrom(value: string | undefined): string {
  const raw = requirePresent(value);
  try {
    const canonical = normalizeOptionalEmail(raw);
    if (canonical === null) throw new MailConfigError("SMTP configuration is invalid");
    return canonical;
  } catch {
    throw new MailConfigError("SMTP configuration is invalid");
  }
}

export function loadSmtpConfig(): SmtpConfig {
  return {
    host: requirePresent(readFileBackedValue("SMTP_HOST")),
    port: parsePort(readFileBackedValue("SMTP_PORT")),
    user: requirePresent(readFileBackedValue("SMTP_USER")),
    password: requirePresent(readFileBackedValue("SMTP_PASSWORD")),
    from: parseFrom(readFileBackedValue("SMTP_FROM")),
    tlsMode: parseTlsMode(readFileBackedValue("SMTP_TLS_MODE")),
  };
}

export function loadPublicOrigin(): string {
  const raw = readFileBackedValue("PUBLIC_ORIGIN");
  if (isBlank(raw)) throw new MailConfigError("Public origin configuration is invalid");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new MailConfigError("Public origin configuration is invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new MailConfigError("Public origin configuration is invalid");
  }
  return url.toString();
}
