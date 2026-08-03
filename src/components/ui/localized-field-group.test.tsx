import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { LocalizedFieldGroup, supportedLocales } from "./localized-field-group"

const source = readFileSync(
  new URL("./localized-field-group.tsx", import.meta.url),
  "utf8",
)

describe("LocalizedFieldGroup", () => {
  it("keeps the locale set closed and receives already-localized field content", () => {
    expect(supportedLocales).toEqual(["pt-BR", "en"])
    expect(source).toContain("Record<SupportedLocale, LocalizedFieldEntry>")
    expect(source).not.toMatch(/@\/i18n|@\/mock|@\/auth|@\/data/u)
  })

  it("associates the active field with its localized label and error", () => {
    const markup = renderToStaticMarkup(
      <LocalizedFieldGroup
        id="product-name"
        groupLabel="Localized product name"
        fields={{
          "pt-BR": {
            localeLabel: "Português",
            label: "Nome do produto",
            value: "",
            error: "Informe o nome.",
          },
          en: {
            localeLabel: "English",
            label: "Product name",
            value: "Coffee",
          },
        }}
        onValueChange={vi.fn()}
        required
      />,
    )

    expect(markup).toContain('aria-labelledby="product-name-label"')
    expect(markup).toContain('id="product-name-pt-BR"')
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain('aria-describedby="product-name-pt-BR-error"')
    expect(markup).toContain("Informe o nome.")
  })
})
