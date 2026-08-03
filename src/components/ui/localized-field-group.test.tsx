// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LocalizedFieldGroup, supportedLocales } from "./localized-field-group"

afterEach(cleanup)

describe("LocalizedFieldGroup", () => {
  it("selects localized fields by keyboard and keeps their labels and errors associated", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
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
            description: "Shown to English-speaking customers.",
          },
        }}
        onValueChange={onValueChange}
        required
      />,
    )

    expect(supportedLocales).toEqual(["pt-BR", "en"])
    const portugueseTab = screen.getByRole("tab", { name: /Português/ })
    expect(portugueseTab.getAttribute("aria-selected")).toBe("true")
    const portugueseInput = screen.getByLabelText(/Nome do produto/)
    expect(portugueseInput.getAttribute("aria-invalid")).toBe("true")
    expect(portugueseInput.getAttribute("aria-describedby")).toBe(
      "product-name-pt-BR-error",
    )

    portugueseTab.focus()
    await user.keyboard("{ArrowRight}")

    const englishTab = screen.getByRole("tab", { name: "English" })
    expect(englishTab.getAttribute("aria-selected")).toBe("true")
    const englishInput = screen.getByLabelText(/Product name/)
    expect(englishInput).toHaveProperty("value", "Coffee")
    await user.type(englishInput, " beans")
    expect(onValueChange).toHaveBeenLastCalledWith("en", "Coffees")
  })
})
