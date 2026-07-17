import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginSubmit } from "./login-submit";

describe("login submit control", () => {
  it("renders a native form-associated control ready for click or Enter submission", () => {
    const markup = renderToStaticMarkup(createElement(LoginSubmit, { form: "login-form", label: "Entrar", pendingLabel: "Entrando" }));

    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('form="login-form"');
    expect(markup).toContain('type="submit"');
    expect(markup).not.toContain('data-slot="spinner"');
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain("Entrar");
  });
});
