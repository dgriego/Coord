import { describe, expect, it } from "vitest";
import { can, canAssignRole, permissionKey } from "./roles.ts";

describe("roles", () => {
  it("hides cost from assistants only", () => {
    expect(can("assistant", "cost.view")).toBe(false);
    expect(can("designer", "cost.view")).toBe(true);
    expect(can("bookkeeper", "cost.view")).toBe(true);
  });

  it("only lets owners create owners", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "designer")).toBe(true);
    expect(canAssignRole("designer", "assistant")).toBe(false);
  });

  it("gives roles with different visibility different cache keys", () => {
    expect(permissionKey("assistant")).not.toBe(permissionKey("designer"));
    expect(permissionKey("assistant")).toBe("projects.edit");
  });
});
