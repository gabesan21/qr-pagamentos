import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";

const { requireContext } = vi.hoisted(() => ({ requireContext: vi.fn() }));

vi.mock("./shell-context", () => ({ requireAdminShellContext: requireContext }));

import AdminPage from "./page";

describe("administrator dashboard", () => {
  it("re-authorizes before rendering an honest localized scaffold", async () => {
    requireContext.mockResolvedValue({
      dictionary: en,
      locale: "en",
      principal: { id: "admin-1", username: "operator", role: "ADMIN", status: "ACTIVE" },
    });

    const html = renderToStaticMarkup(await AdminPage());

    expect(requireContext).toHaveBeenCalledOnce();
    expect(html).toContain(en.shellAdminDashboardTitle);
    expect(html).toContain(en.shellWorkspaceEmptyDescription);
    expect(html).not.toMatch(/chart|metric|total/i);
  });
});
