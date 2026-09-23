import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPollingController } from "./public-checkout-form";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";

class TestVisibilityDocument {
  visibilityState: Document["visibilityState"] = "visible";
  private readonly listeners = new Set<() => void>();

  addEventListener(_type: "visibilitychange", listener: () => void) { this.listeners.add(listener); }
  removeEventListener(_type: "visibilitychange", listener: () => void) { this.listeners.delete(listener); }
  setVisibility(visibilityState: Document["visibilityState"]) {
    this.visibilityState = visibilityState;
    for (const listener of this.listeners) listener();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createPollingController", () => {
  it("aborts hidden capability polls, ignores stale responses, and resumes without overlap", async () => {
    vi.useFakeTimers();
    const document = new TestVisibilityDocument();
    const requests: Array<{ response: ReturnType<typeof deferred<Response>>; signal: AbortSignal }> = [];
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) throw new Error("status poll must be abortable");
      const response = deferred<Response>();
      requests.push({ response, signal });
      return response.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const observedStates: string[] = [];
    const polling = createPollingController(document, async ({ isCurrent, schedule, signal }) => {
      const response = await fetch(`/api/payment-links/${identifier}/checkout/status`, { method: "POST", signal });
      if (!isCurrent()) return;
      const body = await response.json() as { state: string };
      if (!isCurrent()) return;
      observedStates.push(body.state);
      schedule(5_000);
    });

    polling.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    document.setVisibility("hidden");
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    requests[0]?.response.resolve(new Response(JSON.stringify({ state: "CREATED" })));
    await flushPromises();
    expect(observedStates).toEqual([]);

    document.setVisibility("visible");
    document.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requests.filter((request) => !request.signal.aborted)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    requests[1]?.response.resolve(new Response(JSON.stringify({ state: "PENDING" })));
    await flushPromises();
    expect(observedStates).toEqual(["PENDING"]);
    expect(vi.getTimerCount()).toBe(1);
    document.setVisibility("hidden");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    document.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    polling.stop();
    expect(requests[2]?.signal.aborted).toBe(true);
    requests[2]?.response.resolve(new Response(JSON.stringify({ state: "CONFIRMED" })));
    await flushPromises();
    expect(observedStates).toEqual(["PENDING"]);
    document.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
