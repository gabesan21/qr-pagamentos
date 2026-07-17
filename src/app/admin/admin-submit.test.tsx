import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useFormStatus } = vi.hoisted(() => ({ useFormStatus: vi.fn() }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));

import { AdminSubmit } from "./admin-submit";

describe("admin submit state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is visibly pending and disabled during a mutation", () => {
    useFormStatus.mockReturnValue({ pending: true });
    const markup = renderToStaticMarkup(createElement(AdminSubmit, { label: "Save" }));
    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
  });

  it("is keyboard-operable in its default state", () => {
    useFormStatus.mockReturnValue({ pending: false });
    const markup = renderToStaticMarkup(createElement(AdminSubmit, { label: "Save" }));
    expect(markup).not.toContain('data-slot="spinner"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain('type="submit"');
  });
});
