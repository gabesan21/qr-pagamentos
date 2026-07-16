import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /[lang]/login/submit", () => {
  it("cannot retain a locale-prefixed sign-in mutation", async () => {
    expect((await POST()).status).toBe(404);
  });
});
