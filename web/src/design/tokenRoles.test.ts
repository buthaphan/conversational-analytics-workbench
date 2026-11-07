import { describe, expect, it } from "vitest";
import { tokenRoles } from "./tokenRoles";
import { colors } from "./tokens";

describe("token roles (AC-10, F6)", () => {
  it.each(Object.keys(colors))("describes the role of --color-%s", (name) => {
    expect(tokenRoles[name]?.trim().length ?? 0).toBeGreaterThan(5);
  });

  it("has no roles for tokens that do not exist", () => {
    expect(Object.keys(tokenRoles).filter((name) => !(name in colors))).toEqual([]);
  });
});
