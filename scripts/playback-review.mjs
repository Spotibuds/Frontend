import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.REVIEW_BASE_URL || "http://127.0.0.1:3100";
const output = ".impeccable/review/playback";
await mkdir(output, { recursive: true });
const me = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "listener",
  displayName: "Alex",
  roles: ["User"],
};
const token = `e30.${Buffer.from(JSON.stringify({ sub: me.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
const songs = ["First track", "Second track"].map((title, index) => ({
  id: String(index + 1).padStart(24, "0"),
  title,
  artists: [{ id: "artist", name: "Test artist" }],
  durationSec: 90,
  fileUrl: `http://127.0.0.1:5102/api/media/blob/songs/test-${index}.wav`,
}));
const wav = Buffer.alloc(44 + 90 * 8000 * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.REVIEW_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const reports = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [],
      mediaRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(),
        url = new URL(request.url()),
        p = url.pathname;
      if (url.origin === base && !p.startsWith("/api/")) return route.continue();
      const cors = {
        "access-control-allow-origin": base,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        "access-control-allow-headers": "*",
      };
      const json = data =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(data),
          headers: cors,
        });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (p.endsWith("/auth/refresh/prepare")) return route.fulfill({ status: 204, headers: cors });
      if (p.endsWith("/auth/refresh/complete")) return json({ token, user: me });
      if (p.startsWith("/api/media/")) {
        mediaRequests.push({ path: p, range: request.headers().range });
        const match = /bytes=(\d+)-(\d*)/.exec(request.headers().range || "");
        const start = match ? Number(match[1]) : 0,
          end = match?.[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1;
        return route.fulfill({
          status: match ? 206 : 200,
          body: wav.subarray(start, end + 1),
          contentType: "audio/wav",
          headers: {
            ...cors,
            "accept-ranges": "bytes",
            ...(match ? { "content-range": `bytes ${start}-${end}/${wav.length}` } : {}),
          },
        });
      }
      if (p === "/api/songs") return json(songs);
      if (
        p === "/api/albums" ||
        p === "/api/artists" ||
        p.includes("/playlists/") ||
        p.includes("/friends/") ||
        p.includes("/follows/")
      )
        return json([]);
      if (p.includes("/notifications/"))
        return json({ notifications: [], unreadCount: 0, totalCount: 0, nextBefore: null });
      if (p.includes("/chats/")) return json({});
      if (p.includes("/users/"))
        return json({
          ...me,
          identityUserId: me.id,
          userName: me.username,
          playlists: [],
          followedUsers: [],
          followers: [],
        });
      if (p.startsWith("/api/feed/nowplaying")) return json({ success: true });
      if (p.includes("-hub/"))
        return route.fulfill({
          status: 503,
          headers: cors,
          contentType: "application/json",
          body: '{"message":"SignalR is outside this playback fixture"}',
        });
      return route.fulfill({
        status: 404,
        headers: cors,
        contentType: "application/json",
        body: '{"message":"Outside playback fixture"}',
      });
    });
    await page.goto(base + "/dashboard", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Play First track", exact: true }).click();
    await page.getByRole("button", { name: "Add Second track to queue", exact: true }).click();
    const footer = page.getByRole("contentinfo", { name: "Music player" });
    const line = footer.getByRole("slider", { name: "Playback position" });
    await expect(line).toBeVisible();
    await expect(line).toBeEnabled();
    await expect(footer.getByRole("button", { name: "Pause playback" })).toBeEnabled();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            [...document.querySelectorAll("audio")].filter(audio => audio.hasAttribute("src"))
              .length
        )
      )
      .toBe(2);
    await line.evaluate(input => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "30");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect.poll(() => line.getAttribute("aria-valuetext")).toMatch(/^0:3/);
    const geometry = await page.evaluate(() => {
      const footer = document.querySelector(".player-bar"),
        line = footer.querySelector('[aria-label="Playback position"]');
      const rect = line.getBoundingClientRect();
      const open = footer.querySelector('[aria-label="Open music player"]');
      const openRect = open.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        line: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        footerHeight: footer.getBoundingClientRect().height,
        buffered: line.style.getPropertyValue("--buffered"),
        played: line.style.getPropertyValue("--played"),
        trackControlUncovered: open.contains(
          document.elementFromPoint(
            openRect.x + openRect.width / 2,
            openRect.y + openRect.height / 2
          )
        ),
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
    expect(geometry.trackControlUncovered).toBe(true);
    expect(geometry.line.width).toBeGreaterThan(width < 768 ? 180 : 200);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `${output}/${width}-home-player.png`, animations: "disabled" });
    const nextLoads = mediaRequests.filter(request => request.path.includes("test-1.wav")).length;
    await footer.getByRole("button", { name: "Next song" }).click();
    await expect(footer).toContainText("Second track");
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll("audio")].some(
            audio => audio.src.includes("test-1.wav") && !audio.paused
          )
        )
      )
      .toBe(true);
    expect(mediaRequests.filter(request => request.path.includes("test-1.wav"))).toHaveLength(
      nextLoads
    );
    await footer.getByRole("button", { name: "Pause playback" }).click();
    await expect(footer.getByRole("button", { name: "Play playback" })).toBeVisible();
    reports.push({ width, ...geometry, nextTrackReused: true, pageErrors: errors });
    await context.close();
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        scope:
          "Local production UI with generated WAV media and isolated REST fixtures; no live persistence",
        reports,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(reports));
} finally {
  await browser.close();
}
