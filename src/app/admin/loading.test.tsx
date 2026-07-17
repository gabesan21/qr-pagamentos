import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

import AdminLoading from "./loading";

describe("admin loading state", () => {
  it("announces protected loading without selecting the wrong persisted locale", () => {
    const markup = renderToStaticMarkup(<AdminLoading />);
    expect(markup).toContain('aria-busy="true"');
    for (const copy of [en.adminLoadingHeading, en.adminLoadingDescription, ptBR.adminLoadingHeading, ptBR.adminLoadingDescription]) {
      expect(markup).toContain(copy);
    }
    expect(markup.match(/data-slot="skeleton"/g)).toHaveLength(3);
  });
});
