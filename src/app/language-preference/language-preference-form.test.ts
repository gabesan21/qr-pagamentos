import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useFormStatus } = vi.hoisted(() => ({ useFormStatus: vi.fn() }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));

import { LanguagePreferenceSubmit } from "./language-preference-form";

describe("language preference submit control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the shared native button with a visible loading and disabled state", () => {
    useFormStatus.mockReturnValue({ pending: true });

    const markup = renderToStaticMarkup(createElement(LanguagePreferenceSubmit, { label: "Save language" }));

    expect(markup).toContain("<button");
    expect(markup).toContain("type=\"submit\"");
    expect(markup).toContain("aria-busy=\"true\"");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("Save language");
  });

  it("remains enabled when the form is ready for keyboard submission", () => {
    useFormStatus.mockReturnValue({ pending: false });

    const markup = renderToStaticMarkup(createElement(LanguagePreferenceSubmit, { label: "Save language" }));

    expect(markup).toContain("type=\"submit\"");
    expect(markup).not.toContain("disabled=\"\"");
    expect(markup).not.toContain("aria-busy=\"true\"");
  });
});
