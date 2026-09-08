import { describe, expect, it } from "vitest";

import { resolveSettingsReturnTarget } from "./settings-return-target";

function request(headers: Record<string, string>) {
  return new Request("http://local/language-preference", { method: "POST", headers });
}

describe("resolveSettingsReturnTarget", () => {
  it("returns /settings for a same-host Referer pointing at /settings", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local", referer: "http://local/settings" }));
    expect(target).toBe("/settings");
  });

  it("returns / for a same-host Referer pointing at /", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local", referer: "http://local/" }));
    expect(target).toBe("/");
  });

  it("checks the host exactly like the Origin guard: X-Forwarded-Host first, else Host", () => {
    const target = resolveSettingsReturnTarget(
      request({ host: "internal", "x-forwarded-host": "local", referer: "http://local/settings" }),
    );
    expect(target).toBe("/settings");
  });

  it("falls back to / for a foreign-host Referer", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local", referer: "https://evil.example/settings" }));
    expect(target).toBe("/");
  });

  it("falls back to / for a protocol-relative foreign Referer", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local", referer: "//evil.example/settings" }));
    expect(target).toBe("/");
  });

  it("returns any same-host path as-is, not a closed allowlist", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local", referer: "http://local/catalog?tab=links" }));
    expect(target).toBe("/catalog?tab=links");
  });

  it("falls back to / for a backslash-prefixed hostile Referer", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local", referer: "\\\\evil.example/settings" }));
    expect(target).toBe("/");
  });

  it("falls back to / for a non-http(s) scheme", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local", referer: "javascript:alert(1)" }));
    expect(target).toBe("/");
  });

  it("falls back to / for an unparseable Referer", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local", referer: "not a url" }));
    expect(target).toBe("/");
  });

  it("falls back to / for an absent Referer", () => {
    const target = resolveSettingsReturnTarget(request({ host: "local" }));
    expect(target).toBe("/");
  });

  it("keeps the query but discards the fragment from an allowed Referer path", () => {
    const target = resolveSettingsReturnTarget(
      request({ host: "local", referer: "http://local/settings?foo=bar#section" }),
    );
    expect(target).toBe("/settings?foo=bar");
  });
});
