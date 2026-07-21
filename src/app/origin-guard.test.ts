import { describe, expect, it } from "vitest";

import { rejectCrossOrigin } from "./origin-guard";

const request = (headers: Record<string, string>) =>
  new Request("http://internal:3000/products", { method: "POST", headers });

const expectEmptyRejection = async (response: Response | null) => {
  expect(response).not.toBeNull();
  expect(response?.status).toBe(403);
  expect(await response?.text()).toBe("");
};

describe("rejectCrossOrigin", () => {
  it("accepts a POST whose Origin host matches the Host header", () => {
    expect(rejectCrossOrigin(request({ origin: "http://internal:3000", host: "internal:3000" }))).toBeNull();
  });

  it("rejects a missing Origin", async () => {
    await expectEmptyRejection(rejectCrossOrigin(request({ host: "internal:3000" })));
  });

  it("rejects a malformed Origin", async () => {
    await expectEmptyRejection(rejectCrossOrigin(request({ origin: "null", host: "internal:3000" })));
    await expectEmptyRejection(rejectCrossOrigin(request({ origin: "javascript://internal:3000", host: "internal:3000" })));
  });

  it("rejects an Origin host that mismatches Host, including the port", async () => {
    await expectEmptyRejection(rejectCrossOrigin(request({ origin: "https://evil.example", host: "internal:3000" })));
    await expectEmptyRejection(rejectCrossOrigin(request({ origin: "http://internal:4444", host: "internal:3000" })));
  });

  it("compares against X-Forwarded-Host when present, ignoring a rewritten Host", () => {
    const proxied = { origin: "https://pay.example.com", host: "internal:3000", "x-forwarded-host": "pay.example.com" };
    expect(rejectCrossOrigin(request(proxied))).toBeNull();
  });

  it("uses the first X-Forwarded-Host value and rejects a proxied mismatch", async () => {
    const chained = { origin: "https://pay.example.com", host: "internal:3000", "x-forwarded-host": "pay.example.com, edge.example" };
    expect(rejectCrossOrigin(request(chained))).toBeNull();
    const spoofed = { origin: "https://evil.example", host: "internal:3000", "x-forwarded-host": "pay.example.com" };
    await expectEmptyRejection(rejectCrossOrigin(request(spoofed)));
  });

  it("rejects when neither Host nor X-Forwarded-Host is present", async () => {
    await expectEmptyRejection(rejectCrossOrigin(request({ origin: "http://internal:3000" })));
  });
});
