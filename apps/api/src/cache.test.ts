import { describe, expect, it } from "vitest";
import { StudioCache } from "./cache.ts";

describe("StudioCache", () => {
  it("keeps separate entries per permission set", async () => {
    const cache = new StudioCache();
    const asDesigner = await cache.get("s1", "designer", "items", async () => ({ cost: 6200 }));
    const asAssistant = await cache.get("s1", "assistant", "items", async () => ({}));
    expect(asDesigner).toEqual({ cost: 6200 });
    expect(asAssistant).toEqual({});
  });

  it("drops a studio's entries when its data changes", async () => {
    const cache = new StudioCache();
    let loads = 0;
    const load = async () => ++loads;
    await cache.get("s1", "owner", "members", load);
    await cache.get("s1", "owner", "members", load);
    expect(loads).toBe(1);
    cache.bump("s1");
    await cache.get("s1", "owner", "members", load);
    expect(loads).toBe(2);
  });

  it("doesn't share entries between studios", async () => {
    const cache = new StudioCache();
    await cache.get("s1", "owner", "members", async () => "studio one");
    expect(await cache.get("s2", "owner", "members", async () => "studio two")).toBe("studio two");
  });
});
