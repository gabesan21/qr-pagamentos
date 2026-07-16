import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /[lang]/admin-access", () => {
  it("cannot retain a locale-prefixed authorization surface", async () => {
    expect((await GET()).status).toBe(404);
  });
});
