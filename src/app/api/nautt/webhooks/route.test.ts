import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleNauttWebhook } = vi.hoisted(() => ({ handleNauttWebhook: vi.fn() }));
vi.mock("../../../../integrations/nautt/webhook-runtime", () => ({ handleNauttWebhook }));
vi.mock("server-only", () => ({}));

import { MAX_WEBHOOK_BODY_BYTES } from "../../../../integrations/nautt/bounded-webhook-body";
import { POST } from "./route";

beforeEach(() => {
  handleNauttWebhook.mockReset().mockResolvedValue({ status: 204 });
});

function requestFromChunks(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  let pulls = 0;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulls++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { canceled = true; },
  });
  const request = new Request("https://payments.example.com/api/nautt/webhooks", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit & { duplex: string });
  return { request, pulls: () => pulls, canceled: () => canceled };
}

describe("POST /api/nautt/webhooks", () => {
  it("preserves accepted multi-chunk bytes exactly and returns an empty no-store response", async () => {
    const chunks = [Buffer.from("{\"a\":"), Buffer.from(" 1}\n")];
    const { request } = requestFromChunks(chunks, { "x-nautt-signature": `sha256=${"a".repeat(64)}` });
    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(handleNauttWebhook.mock.calls[0][0].rawBody).toEqual(Buffer.concat(chunks));
  });

  it("rejects declared oversize before intake and cancels the untouched stream", async () => {
    const harness = requestFromChunks([new Uint8Array(1)], { "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) });
    const response = await POST(harness.request);
    expect(response.status).toBe(413);
    expect(harness.canceled()).toBe(true);
    expect(handleNauttWebhook).not.toHaveBeenCalled();
  });

  it("cancels a no-length stream on the first crossing chunk without pulling the tail", async () => {
    const harness = requestFromChunks([new Uint8Array(MAX_WEBHOOK_BODY_BYTES), new Uint8Array(1), new Uint8Array(12)]);
    const response = await POST(harness.request);
    expect(response.status).toBe(413);
    expect(harness.canceled()).toBe(true);
    expect(harness.pulls()).toBe(2);
    expect(handleNauttWebhook).not.toHaveBeenCalled();
  });
});
