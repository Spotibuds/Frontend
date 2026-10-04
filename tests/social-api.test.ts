import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/lib/request", () => ({ apiRequest: fixture.request }));
import { userApi } from "../src/lib/api";
beforeEach(() => {
  fixture.request.mockReset().mockResolvedValue(undefined);
});
it("uses the pending-only cancellation contract and sends only the canonical recipient property", async () => {
  await userApi.cancelFriendRequest("opaque-current-request");
  expect(fixture.request).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/friends\/opaque-current-request\?pendingOnly=true$/),
    { method: "DELETE" }
  );
  await userApi.sendFriendRequest("ignored-actor", "recipient-guid");
  expect(fixture.request).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/api\/friends\/request$/),
    { method: "POST", body: JSON.stringify({ targetUserId: "recipient-guid" }) }
  );
});
it("resolves fifty conversations' distinct participants without exceeding the profile batch limit", async () => {
  fixture.request.mockImplementation(async (_url: string, init: { body: string }) =>
    JSON.parse(init.body).userIds.map((id: string) => ({ identityUserId: id, userName: id }))
  );
  const ids = Array.from({ length: 51 }, (_, index) => `participant-${index}`);
  const profiles = await userApi.getUserProfilesBatch([...ids, ids[0]]);
  expect(profiles.map(profile => profile.id)).toEqual(ids);
  expect(fixture.request).toHaveBeenCalledTimes(2);
  expect(
    fixture.request.mock.calls.map(([, init]) => JSON.parse(init.body).userIds.length)
  ).toEqual([50, 1]);
});
