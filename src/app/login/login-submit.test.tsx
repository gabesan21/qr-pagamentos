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
  beforeEach(() => vi.clearAllMocks());

  it("renders a native submit control ready for click or Enter submission", () => {
    useFormStatus.mockReturnValue({ pending: false });
    const markup = renderToStaticMarkup(createElement(LoginSubmit, { label: "Entrar", pendingLabel: "Entrando" }));

    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('type="submit"');
    expect(markup).not.toContain('data-slot="spinner"');
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain("Entrar");
  });

  it("is visibly pending and disabled during a mutation", () => {
    useFormStatus.mockReturnValue({ pending: true });
    const markup = renderToStaticMarkup(createElement(LoginSubmit, { label: "Entrar", pendingLabel: "Entrando" }));

    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Entrando");
  });
});
