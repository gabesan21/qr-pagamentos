import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readCookie } = vi.hoisted(() => ({ readCookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: readCookie }) }));

import { getDictionary } from "@/i18n/dictionaries";
import NotFound from "./not-found";

describe("bilingual 404", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readCookie.mockReturnValue(undefined);
  });

  it("renders the pt-BR copy by default", async () => {
    const markup = renderToStaticMarkup(await NotFound());
    const dictionary = getDictionary("pt-BR");

    expect(markup).toContain(dictionary.notFoundTitle);
    expect(markup).toContain(dictionary.notFoundBody);
  });

  it("renders the en copy for the persisted en preference", async () => {
    readCookie.mockReturnValue({ value: "en" });
    const markup = renderToStaticMarkup(await NotFound());
    const dictionary = getDictionary("en");

    expect(markup).toContain(dictionary.notFoundTitle);
    expect(markup).toContain(dictionary.notFoundBody);
  });
});
