import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ptBR } from "@/i18n/dictionaries/pt-BR";

const { requireContext } = vi.hoisted(() => ({ requireContext: vi.fn() }));

vi.mock("./shell-context", () => ({ requireMerchantShellContext: requireContext }));

import MerchantDashboardPage from "./page";

describe("merchant dashboard", () => {
  it("re-authorizes before rendering an honest localized scaffold", async () => {
    requireContext.mockResolvedValue({
      dictionary: ptBR,
      locale: "pt-BR",
      principal: { id: "user-1", username: "lojista", role: "USER", status: "ACTIVE" },
    });

    const html = renderToStaticMarkup(await MerchantDashboardPage());

    expect(requireContext).toHaveBeenCalledOnce();
    expect(html).toContain(ptBR.shellMerchantDashboardTitle);
    expect(html).toContain(ptBR.shellWorkspaceEmptyDescription);
    expect(html).not.toMatch(/gráfico|métrica|total/i);
  });
});
