import { spawnSync } from "node:child_process";

// There is no patched braces release as of 2026-10-03. This exact advisory is
// reachable only through Next's development ESLint static file globs. It is
// absent from npm's production graph. Fail closed when a patch or new advisory
// appears, or the short review window expires.
const exception = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const expires = Date.parse("2026-10-17T00:00:00Z");
function audit(production) {
  const result = spawnSync(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32"
      ? ["/d", "/s", "/c", production ? "npm audit --json --omit=dev" : "npm audit --json"]
      : ["audit", "--json", ...(production ? ["--omit=dev"] : [])],
    { encoding: "utf8" }
  );
  if (result.error) throw result.error;
  if (result.signal || ![0, 1].includes(result.status))
    throw new Error("Dependency audit process failed.");
  const report = JSON.parse(result.stdout);
  if (report.error) throw new Error(`Dependency audit unavailable: ${report.error.summary}`);
  if (
    report.auditReportVersion !== 2 ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== "object" ||
    Array.isArray(report.vulnerabilities) ||
    !Number.isInteger(report.metadata?.vulnerabilities?.total) ||
    !Number.isInteger(report.metadata?.dependencies?.total) ||
    report.metadata.dependencies.total <= 0
  )
    throw new Error("Incomplete dependency audit report.");
  if ((result.status === 0) !== (report.metadata.vulnerabilities.total === 0))
    throw new Error("Dependency audit status contradicts its findings.");
  return report;
}
try {
  const runtime = audit(true);
  if (Object.keys(runtime.vulnerabilities || {}).length)
    throw new Error("Runtime dependencies contain advisories.");
  const full = audit(false);
  const advisories = Object.values(full.vulnerabilities || {}).flatMap(value =>
    value.via.filter(via => typeof via !== "string")
  );
  const affected = Object.values(full.vulnerabilities || {});
  if (
    affected.length &&
    (Date.now() >= expires ||
      advisories.length !== 1 ||
      advisories[0].url !== exception ||
      affected.some(
        value =>
          value.fixAvailable &&
          (typeof value.fixAvailable !== "object" ||
            value.fixAvailable.name !== "eslint-config-next" ||
            value.fixAvailable.version !== "14.2.35")
      ) ||
      affected.some(
        value =>
          ![
            "eslint-config-next",
            "@next/eslint-plugin-next",
            "fast-glob",
            "micromatch",
            "braces",
          ].includes(value.name)
      ))
  )
    throw new Error("New, patched, or expired dependency advisory exception.");
  console.log(
    `Production dependency advisories: 0. Development advisories: ${advisories.length}; ${advisories.length ? "exact unpatched static-lint exception expires 2026-10-17" : "none"}.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Dependency audit failed.");
  process.exitCode = 1;
}
