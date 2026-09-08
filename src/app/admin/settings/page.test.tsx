import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

const { requireContext, list, listCurrencyPairs, listPaymentMethods, listMappings, getDefaultTheme, useFormStatus } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  list: vi.fn(),
  listCurrencyPairs: vi.fn(),
  listPaymentMethods: vi.fn(),
  listMappings: vi.fn(),
  getDefaultTheme: vi.fn(),
  useFormStatus: vi.fn(),
}));

vi.mock("../shell-context", () => ({ requireAdminShellContext: requireContext }));
vi.mock("@/auth/payment-settings", () => ({ getPaymentSettingsService: () => ({ list }) }));
vi.mock("@/auth/nautt-catalog", () => ({ getNauttCatalogService: () => ({ listCurrencyPairs, listPaymentMethods }) }));
vi.mock("@/auth/supported-exchange-currency", () => ({ getSupportedExchangeCurrencyService: () => ({ listMappings }) }));
vi.mock("@/auth/system-settings", () => ({ getSystemSettingsService: () => ({ getDefaultTheme }) }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));

import AdminSettingsPage from "./page";

const principal = { id: "admin-1", username: "operator", role: "ADMIN", status: "ACTIVE" };
const query = (params: Record<string, string> = {}) => Promise.resolve(params);

beforeEach(() => {
  vi.clearAllMocks();
  useFormStatus.mockReturnValue({ pending: false });
  list.mockResolvedValue({ currencies: ["BRL"], paymentMethods: ["PIX"] });
  listCurrencyPairs.mockResolvedValue([]);
  listPaymentMethods.mockResolvedValue([]);
  listMappings.mockResolvedValue([{ code: "BRL", label: "BRL/USDT" }]);
  getDefaultTheme.mockResolvedValue("vault-blue");
});

describe("administrator settings hub", () => {
  it("re-authorizes and renders all six anchored sections bilingually with the effective default theme", async () => {
    for (const [locale, dictionary] of [["en", en], ["pt-BR", ptBR]] as const) {
      requireContext.mockResolvedValue({ dictionary, locale, principal });

      const html = renderToStaticMarkup(await AdminSettingsPage({ searchParams: query() }));

      expect(requireContext).toHaveBeenCalled();
      for (const anchor of ["sec-currencies", "sec-pairs", "sec-methods", "sec-globalPayments", "sec-appearance", "sec-language"]) {
        expect(html).toContain(`id="${anchor}"`);
        expect(html).toContain(`href="#${anchor}"`);
      }
      expect(html).toContain(dictionary.adminSecCurrencies);
      expect(html).toContain(dictionary.adminSecPairs);
      expect(html).toContain(dictionary.adminSecMethods);
      expect(html).toContain(dictionary.adminSecGlobalPayments);
      expect(html).toContain(dictionary.adminAppearanceHeading);
      expect(html).toContain(dictionary.languageHeading);
      expect(html).toContain('action="/admin/exchange-currencies"');
      expect(html).toContain('action="/admin/payment-settings"');
      expect(html).toContain('action="/admin/settings/default-theme"');
      expect(html).toContain('action="/language-preference"');
      expect(html).toContain('value="vault-blue"');
      expect(html).toContain("BRL/USDT");

      // §4 payment settings: the closed catalog posts hidden inputs named
      // after the route's expected fields (payment-settings/route.ts reads
      // `currencies`/`paymentMethods`). The confirm-before-disable gate
      // itself is covered in payment-settings-section.test.tsx (it only
      // mounts once a row is toggled off).
      expect(html).toContain('name="currencies"');
      expect(html).toContain('name="paymentMethods"');
      expect(html).toContain('value="BRL"');
      expect(html).toContain('value="PIX"');

      // Language section: every locale button is a real `type="submit"`
      // named `locale` that applies on click, with no separate Save step.
      const languageMarkup = html.slice(html.indexOf('id="sec-language"'));
      expect(languageMarkup).toContain('name="locale"');
      expect(languageMarkup).toContain('type="submit"');
      expect(languageMarkup).not.toContain(dictionary.save);
    }
  });

  it("renders the closed bilingual notices for every mutation outcome", async () => {
    requireContext.mockResolvedValue({ dictionary: en, locale: "en", principal });

    const saved = renderToStaticMarkup(await AdminSettingsPage({ searchParams: query({ success: "theme-default" }) }));
    expect(saved).toContain(en.adminThemeDefaultSaved);
    const failed = renderToStaticMarkup(await AdminSettingsPage({ searchParams: query({ error: "theme-default-failed" }) }));
    expect(failed).toContain(en.adminThemeDefaultFailed);
    const exchangeFailed = renderToStaticMarkup(await AdminSettingsPage({ searchParams: query({ error: "exchange-currency-failed" }) }));
    expect(exchangeFailed).toContain(en.adminExchangeCurrencyFailed);
    const settingsSaved = renderToStaticMarkup(await AdminSettingsPage({ searchParams: query({ success: "settings" }) }));
    expect(settingsSaved).toContain(en.adminPaymentSettingsSaved);
  });

  it("renders the explicit empty states for the registry and catalog sections", async () => {
    requireContext.mockResolvedValue({ dictionary: en, locale: "en", principal });
    listMappings.mockResolvedValue([]);

    const html = renderToStaticMarkup(await AdminSettingsPage({ searchParams: query() }));

    expect(html).toContain(en.adminEmptyCurrencies);
    expect(html).toContain(en.adminEmptyRecords);
  });
});
