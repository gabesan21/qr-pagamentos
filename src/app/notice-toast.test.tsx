// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useSearchParams } = vi.hoisted(() => ({ useSearchParams: vi.fn() }));
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("next/navigation", () => ({ useSearchParams }));
vi.mock("@/components/ui/toast", () => ({ showToast }));

import { NoticeToast } from "./notice-toast";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("NoticeToast", () => {
  it("raises the registry's own message, never the raw query value", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams("products=conflict"));
    render(
      <NoticeToast notices={[
        { param: "products", value: "conflict", kind: "error", message: "The product changed in another request." },
      ]} />,
    );

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith({
      kind: "error",
      message: "The product changed in another request.",
      action: undefined,
    });
  });

  it("stays silent when no entry matches the current query", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams("products=unrelated-value"));
    render(
      <NoticeToast notices={[
        { param: "products", value: "conflict", kind: "error", message: "The product changed in another request." },
      ]} />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(showToast).not.toHaveBeenCalled();
  });

  it("wires a retry action that navigates to the given href", async () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, assign } });
    useSearchParams.mockReturnValue(new URLSearchParams("orders=failed"));
    render(
      <NoticeToast notices={[
        { param: "orders", value: "failed", kind: "error", message: "Could not save.", retry: { href: "/orders?retry=1", label: "Try again" } },
      ]} />,
    );

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    const call = showToast.mock.calls[0][0];
    expect(call.action.label).toBe("Try again");
    call.action.onClick();
    expect(assign).toHaveBeenCalledWith("/orders?retry=1");
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("strips only its own matched params via history.replaceState, keeping unrelated ones", async () => {
    window.history.replaceState(null, "", "/orders?orders=failed&other=keep-me");
    const replaceState = vi.spyOn(window.history, "replaceState");
    useSearchParams.mockReturnValue(new URLSearchParams("orders=failed&other=keep-me"));
    render(
      <NoticeToast notices={[
        { param: "orders", value: "failed", kind: "error", message: "Could not save." },
      ]} />,
    );

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replaceState).toHaveBeenCalled());
    const [, , url] = replaceState.mock.calls[0];
    expect(String(url)).toContain("other=keep-me");
    expect(String(url)).not.toContain("orders=failed");
  });

  it("renders nothing for an empty notice registry, never calling useSearchParams", () => {
    const { container } = render(<NoticeToast notices={[]} />);
    expect(container.innerHTML).toBe("");
    expect(useSearchParams).not.toHaveBeenCalled();
  });
});
