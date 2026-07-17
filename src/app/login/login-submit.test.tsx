import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useFormStatus } = vi.hoisted(() => ({ useFormStatus: vi.fn() }));

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));

import { LoginSubmit } from "./login-submit";

describe("login submit control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the owned Button and Spinner while pending", () => {
    useFormStatus.mockReturnValue({ pending: true });

    const markup = renderToStaticMarkup(createElement(LoginSubmit, { form: "login-form", label: "Entrar", pendingLabel: "Entrando" }));

    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Entrando");
  });

  it("remains ready for keyboard submission outside the pending state", () => {
    useFormStatus.mockReturnValue({ pending: false });

    const markup = renderToStaticMarkup(createElement(LoginSubmit, { form: "login-form", label: "Entrar", pendingLabel: "Entrando" }));

    expect(markup).toContain('data-slot="button"');
    expect(markup).not.toContain('data-slot="spinner"');
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain("Entrar");
  });
});
