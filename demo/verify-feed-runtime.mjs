import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Local ordinary-account fixtures only. Secrets remain in an ignored evidence file.
const localFile = new URL("feed-verification.local.json", import.meta.url);
const identity = "http://127.0.0.1:5101";
const users = "http://127.0.0.1:5103";
const fixtures = JSON.parse(
  (await readFile(new URL("fixtures.local.json", import.meta.url), "utf8")).replace(/^\uFEFF/, "")
);
const accounts = JSON.parse(
  (await readFile(new URL("accounts.local.json", import.meta.url), "utf8")).replace(/^\uFEFF/, "")
);
const mode = process.argv[2];
const auth = session => ({
  Authorization: `Bearer ${session.token}`,
  "X-Spotibuds-Request": "1",
  "Content-Type": "application/json",
});
async function call(url, options = {}, expected = 200) {
  const response = await fetch(url, options);
  assert.equal(response.status, expected, `Local fixture HTTP status at ${new URL(url).pathname}`);
  return expected === 204 || expected === 404 ? undefined : response.json();
}
async function login(member) {
  return call(`${identity}/api/auth/login`, {
    method: "POST",
    headers: { "X-Spotibuds-Request": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ username: member.username, password: member.password }),
  });
}
async function save(value) {
  await writeFile(localFile, JSON.stringify(value, null, 2));
}
if (mode === "prepare") {
  let previous;
  try {
    previous = JSON.parse(await readFile(localFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assert(
    !previous || previous.cleaned === true,
    "Remove the exact previous fixture before preparing another."
  );
  const suffix = `${Date.now()}${randomUUID().slice(0, 6)}`;
  const fixture = {
    members: [],
    createdIds: [],
    cleaned: false,
    songId: fixtures.songIds[0],
    verified: false,
  };
  await save(fixture);
  for (let index = 0; index < 2; index++) {
    const member = {
      username: `feedqa${suffix}${index}`,
      email: `feedqa${suffix}${index}@example.test`,
      password: `Fixture!Aa8${randomUUID()}`,
    };
    const result = await call(`${identity}/api/auth/register`, {
      method: "POST",
      headers: { "X-Spotibuds-Request": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ ...member, isPrivate: false }),
    });
    assert.match(result.userId, /^[a-f0-9-]{36}$/i);
    fixture.createdIds.push(result.userId);
    fixture.members.push({ ...member, id: result.userId });
    await save(fixture);
    const session = await login(member);
    assert.deepEqual(session.user.roles, ["User"]);
    await call(`${users}/api/users/${session.user.id}/listening-history`, {
      method: "POST",
      headers: auth(session),
      body: JSON.stringify({
        songId: fixture.songId,
        songTitle: "Untrusted client snapshot",
        artist: "Untrusted client snapshot",
        duration: 2,
      }),
    });
    await call(`${identity}/api/auth/logout`, { method: "POST", headers: auth(session) }, 204);
  }
  fixture.liveId = `nowplaying:${fixture.members[1].id}:${fixture.songId}`;
  await save(fixture);
  console.log(
    "Prepared two exact ordinary feed QA accounts and canonical listening history. Credentials are ignored and not printed."
  );
} else if (mode === "activate" || mode === "verify" || mode === "baseline") {
  const fixture = JSON.parse(await readFile(localFile, "utf8"));
  assert(fixture.cleaned === false && fixture.members.length === 2);
  const author = await login(fixture.members[1]);
  await call(`${users}/api/feed/nowplaying?ttlSec=180`, {
    method: "POST",
    headers: auth(author),
    body: JSON.stringify({ songId: fixture.songId, positionSec: 0, isPlaying: true }),
  });
  // Revoking this API fixture session does not alter the live source's TTL.
  await call(`${identity}/api/auth/logout`, { method: "POST", headers: auth(author) }, 204);
  if (mode === "baseline") {
    const viewer = await login(fixture.members[0]);
    const all = await call(`${users}/api/feed/slides?limit=100`, { headers: auth(viewer) });
    const walked = [];
    let ended = false;
    for (let skip = 0; skip < 60; skip += 3) {
      const page = await call(`${users}/api/feed/slides?limit=3&skip=${skip}`, {
        headers: auth(viewer),
      });
      if (!page.length) {
        ended = true;
        break;
      }
      walked.push(...page);
    }
    const distinct = new Set(walked.map(item => item.postId));
    const missed = all.filter(item => !distinct.has(item.postId)).length;
    const duplicates = walked.length - distinct.size;
    assert(
      missed > 0 || duplicates > 0,
      "Baseline did not reproduce a missing/duplicate card defect."
    );
    fixture.baseline = {
      observedAt: new Date().toISOString(),
      eligibleInLargePage: all.length,
      smallPagesReturned: walked.length,
      distinctSmallPageCards: distinct.size,
      missingCards: missed,
      duplicateCards: duplicates,
      ended,
    };
    await save(fixture);
    await call(`${identity}/api/auth/logout`, { method: "POST", headers: auth(viewer) }, 204);
    console.log(
      `Original runtime pagination reproduced: ${duplicates} repeated cards, ${missed} known eligible cards missing; small-page walk ${ended ? "stopped" : "reached bound"}.`
    );
  } else if (mode === "verify") {
    const viewer = await login(fixture.members[0]);
    const items = [];
    const cursors = new Set();
    let cursor = null;
    let complete = false;
    for (let page = 0; page < 80; page++) {
      const result = await call(
        `${users}/api/feed/slides/page?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { headers: auth(viewer) }
      );
      items.push(...result.items);
      assert.equal(
        new Set(items.map(item => item.postId)).size,
        items.length,
        "Continuation duplicated a canonical post."
      );
      assert(!items.some(item => item.identityUserId === viewer.user.id));
      if (!result.hasMore) {
        assert.equal(result.nextCursor, null);
        complete = true;
        break;
      }
      assert(result.nextCursor && !cursors.has(result.nextCursor));
      cursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
    assert(complete, "Fixture feed failed to terminate.");
    const source = items.filter(item => item.identityUserId === fixture.members[1].id);
    assert.deepEqual(
      new Set(source.map(item => item.type)),
      new Set([
        "now_playing",
        "recent_song",
        "top_artists_week",
        "top_songs_week",
        "common_artists",
      ])
    );
    fixture.sourcePostIds = source.map(item => item.postId);
    fixture.historyPostId = source.find(item => item.type === "recent_song").postId;
    fixture.verified = true;
    fixture.verifiedAt = new Date().toISOString();
    fixture.verificationSummary = {
      uniquePosts: items.length,
      existingSourceTypes: source.map(item => item.type).sort(),
      selfExcluded: true,
      finiteExhaustion: complete,
    };
    await save(fixture);
    await call(`${identity}/api/auth/logout`, { method: "POST", headers: auth(viewer) }, 204);
    console.log(
      `Verified production feed continuation: ${items.length} unique canonical posts, all five existing types for the scoped author, self excluded, finite exhaustion.`
    );
  } else console.log("Activated the exact scoped feed author for local UI QA.");
} else if (mode === "cleanup") {
  const fixture = JSON.parse(await readFile(localFile, "utf8"));
  assert(fixture.createdIds.length === fixture.members.length && fixture.createdIds.length <= 2);
  assert(
    fixture.members.every(
      (member, index) =>
        member.username.startsWith("feedqa") && fixture.createdIds[index] === member.id
    )
  );
  if (!fixture.cleaned) {
    const admin = await login(accounts.find(account => account.username === "demoadmin"));
    for (const id of fixture.createdIds) {
      await call(
        `${identity}/api/auth/users/${id}`,
        { method: "DELETE", headers: auth(admin) },
        204
      );
      await call(`${identity}/api/auth/users/${id}`, { headers: auth(admin) }, 404);
      await call(`${users}/api/users/${id}`, { headers: auth(admin) }, 404);
    }
    await call(`${identity}/api/auth/logout`, { method: "POST", headers: auth(admin) }, 204);
    fixture.cleaned = true;
    fixture.cleanedAt = new Date().toISOString();
    await save(fixture);
  }
  console.log(
    "Verified exact feed QA fixture cleanup in Identity and User. Existing data and volumes retained."
  );
} else throw new Error("Use prepare, baseline, activate, verify or cleanup.");
