import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { GET as legacyAdmin } from "./[lang]/admin-access/route";
import { POST as legacyLogin } from "./[lang]/login/submit/route";
import { POST as legacyLogout } from "./[lang]/logout/route";
import { GET as health } from "./api/health/route";

describe("unprefixed route contract", () => {
  it("keeps health unlocalized and rejects all remaining locale-prefixed mutations", async () => {
    expect((await health()).status).toBe(200);
    expect((await legacyAdmin()).status).toBe(404);
    expect((await legacyLogin()).status).toBe(404);
    expect((await legacyLogout()).status).toBe(404);
  });

  it("does not leave locale-prefixed page implementations as alternate surfaces", async () => {
    for (const path of ["src/app/[lang]/page.tsx", "src/app/[lang]/login/page.tsx", "src/app/[lang]/design-system/page.tsx"]) {
      expect(await readFile(path, "utf8")).toContain("notFound()");
    }
  });
});
