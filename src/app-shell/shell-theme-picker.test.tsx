// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { STOREFRONT_THEME_IDS } from "@/design-system/themes";
import { THEME_PREFERENCE_LABEL_KEYS } from "@/design-system/theme-preference";

import { ShellThemePicker } from "./shell-theme-picker";
import type { ShellThemeOption } from "./shell-types";

afterEach(() => {
  cleanup();
  document.cookie = "qr_theme=; path=/; max-age=0";
  document.documentElement.removeAttribute("data-theme");
});

const themeOptions: readonly ShellThemeOption[] = STOREFRONT_THEME_IDS.map((id) => ({
  id,
  label: THEME_PREFERENCE_LABEL_KEYS[id],
}));

describe("ShellThemePicker", () => {
  it("renders one menuitemradio per theme with a non-color check marker", () => {
    render(<ShellThemePicker themeOptions={themeOptions} />);

    const options = screen.getAllByRole("menuitemradio");
    expect(options).toHaveLength(6);
    for (const option of options) expect(option.getAttribute("aria-checked")).toBe("false");
  });

  it("marks the active theme, sets the DOM attribute and persists the qr_theme cookie on selection", async () => {
    const user = userEvent.setup();
    render(<ShellThemePicker themeOptions={themeOptions} />);

    const target = screen.getByRole("menuitemradio", { name: THEME_PREFERENCE_LABEL_KEYS["vault-blue"] });
    await user.click(target);

    expect(target.getAttribute("aria-checked")).toBe("true");
    expect(target.querySelector("svg")).not.toBeNull();
    expect(document.documentElement.dataset.theme).toBe("vault-blue");
    expect(document.cookie).toContain("qr_theme=vault-blue");
  });

  it("reads the server-stamped active theme after mount", () => {
    document.documentElement.setAttribute("data-theme", "midnight-clearing");
    render(<ShellThemePicker themeOptions={themeOptions} />);

    expect(screen.getByRole("menuitemradio", { name: THEME_PREFERENCE_LABEL_KEYS["midnight-clearing"] }).getAttribute("aria-checked")).toBe("true");
  });

  it("renders nothing for an empty themeOptions list", () => {
    const { container } = render(<ShellThemePicker themeOptions={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
