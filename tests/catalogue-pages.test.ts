import { beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ generation: 0 }));
vi.mock("@/lib/session", () => ({ getSessionGeneration: () => session.generation }));
import { readCataloguePages } from "@/lib/cataloguePages";
beforeEach(() => {
  session.generation = 0;
});
describe("complete editor catalogue", () => {
  it("reads beyond the default first page and retains all 183 records", async () => {
    const rows = Array.from({ length: 183 }, (_, i) => ({ id: String(i) }));
    const fetch = vi.fn(async (limit: number, skip: number) => rows.slice(skip, skip + limit));
    expect(await readCataloguePages(fetch)).toEqual(rows);
    expect(fetch.mock.calls).toEqual([
      [100, 0],
      [100, 100],
    ]);
  });
  it("deduplicates overlap and rejects a server that repeats a full page", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
    await expect(readCataloguePages(async () => rows)).rejects.toThrow("next library page");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([rows[99], { id: "new" }]);
    expect(await readCataloguePages(fetch)).toHaveLength(101);
  });
  it("does not hand the previous account's index to a changed session", async () => {
    await expect(
      readCataloguePages(async () => {
        session.generation++;
        return [{ id: "private" }];
      })
    ).rejects.toThrow("session changed");
  });
});
