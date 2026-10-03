const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
(async () => {
  const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const executablePath = fs
    .readdirSync(browserRoot)
    .filter(n => /^chromium-\d+$/.test(n))
    .sort()
    .reverse()
    .map(n => path.join(browserRoot, n, "chrome-win64", "chrome.exe"))
    .find(fs.existsSync);
  const browser = await chromium.launch({ executablePath, headless: true, args: ["--mute-audio"] });
  const checks = [];
  const add = (name, passed) => {
    checks.push({ name, passed: !!passed });
    if (!passed) throw new Error(`Development check failed: ${name}`);
  };
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pendingScripts = [];
    const scriptBodies = [];
    let scriptReadFailures = 0;
    let localIdentityBootstrap = false;
    page.on("request", request => {
      if (request.url().startsWith("http://127.0.0.1:5101/api/auth/refresh/prepare"))
        localIdentityBootstrap = true;
    });
    page.on("response", response => {
      const url = new URL(response.url());
      if (url.origin === "http://127.0.0.1:3100" && url.pathname.endsWith(".js"))
        pendingScripts.push(
          response
            .text()
            .then(body => scriptBodies.push(body))
            .catch(() => {
              scriptReadFailures++;
            })
        );
    });
    const response = await page.goto("http://127.0.0.1:3100/", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    add("Development HTTP3100 returns200", response.status() === 200);
    await page.getByLabel("Username", { exact: true }).waitFor({ state: "visible" });
    add(
      "Development login page renders anonymous username/password controls",
      await page.getByLabel("Password", { exact: true }).isVisible()
    );
    await Promise.all(pendingScripts);
    add("All served local JavaScript responses are readable", scriptReadFailures === 0);
    const client = scriptBodies.join("\n");
    for (const port of [5101, 5102, 5103])
      add(
        `Served development client uses loopback API${port}`,
        client.includes(`http://127.0.0.1:${port}`)
      );
    add("Anonymous bootstrap targets configured local Identity", localIdentityBootstrap);
    const policy = response.headers()["content-security-policy"] || "";
    add(
      "Development CSP includes eval support and all local API origins",
      policy.includes("'unsafe-eval'") &&
        [5101, 5102, 5103].every(port => policy.includes(`http://127.0.0.1:${port}`))
    );
    for (const port of [5101, 5102, 5103])
      add(
        `API${port} stays ready during frontend-only development startup`,
        (
          await fetch(`http://127.0.0.1:${port}/health/ready`, {
            signal: AbortSignal.timeout(5000),
          })
        ).status === 200
      );
    fs.writeFileSync(
      "demo/results-development-page.local.json",
      JSON.stringify(
        {
          checks,
          scope:
            "Development startup, anonymous rendering and compiled local configuration only; no authenticated development workflows tested.",
        },
        null,
        2
      )
    );
    console.log(`Development startup/config checks passed: ${checks.length}`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.log(error.message);
  process.exitCode = 1;
});
