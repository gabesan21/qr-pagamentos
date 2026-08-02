import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** The six fixed theme identifiers (design.md §1). */
export const THEMES = [
  "pix-paper",
  "cashier-daylight",
  "settlement-sand",
  "midnight-clearing",
  "vault-blue",
  "terminal-amber",
] as const;

export type ThemeId = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeId = "pix-paper";

const STORAGE_KEY = "qrp:theme";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

function applyTheme(t: ThemeId) {
  document.documentElement.setAttribute("data-theme", t);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = isThemeId(stored) ? stored : DEFAULT_THEME;
    applyTheme(initial);
    return initial;
  });

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
