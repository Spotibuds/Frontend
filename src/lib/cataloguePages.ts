import { getSessionGeneration } from "@/lib/session";

// Editors need the complete metadata index. Public browsing loads one page at
// a time instead. Bound the index to the API's supported paging range.
export async function readCataloguePages<T extends { id: string }>(
  fetchPage: (limit: number, skip: number) => Promise<T[]>
): Promise<T[]> {
  const generation = getSessionGeneration();
  const result: T[] = [];
  const seen = new Set<string>();
  for (let skip = 0; skip <= 10_000; skip += 100) {
    const page = await fetchPage(100, skip);
    if (generation !== getSessionGeneration())
      throw new Error("Your session changed. Reload the library.");
    let added = 0;
    for (const item of page)
      if (!seen.has(item.id)) {
        seen.add(item.id);
        result.push(item);
        added++;
      }
    if (page.length < 100) return result;
    if (!added) throw new Error("The next library page could not be loaded. Retry.");
  }
  throw new Error("The library could not be fully loaded. Use search or retry.");
}
