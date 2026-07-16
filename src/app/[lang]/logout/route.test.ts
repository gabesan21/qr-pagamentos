import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /[lang]/logout", () => {
  it("cannot retain a locale-prefixed logout mutation", async () => {
    expect((await POST()).status).toBe(404);
  });
});
