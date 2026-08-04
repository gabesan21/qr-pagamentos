import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

import AdminLoading from "./loading";

describe("admin loading state", () => {
  it("renders a busy skeleton placeholder with a fixed English dictionary", () => {
    const markup = renderToStaticMarkup(<AdminLoading />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('data-slot="skeleton"');

    // The loading fallback is hard-coded to the English dictionary so it never
    // flashes the wrong persisted locale while the admin layout is resolving.
    expect(markup).toContain(en.adminDashboardUsersHeading);
    expect(markup).not.toContain(ptBR.adminDashboardUsersHeading);
  });
});
