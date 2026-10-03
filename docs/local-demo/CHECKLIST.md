# Spotibuds local demo remediation checklist

Authoritative ledger: `remediation-ledger.json`. Shared setup is versioned here in the Frontend repository; the workspace has four independent repositories. Do not edit original audit evidence.

- [x] Read request, audit report/findings/inventory, identify four clean repository baselines.
- [x] Assign frontend, Identity, Music, User and operations ownership.
- [x] Create ledger with all 73 findings and 19 risk IDs.
- [x] Agree session, field ownership, privacy and media contracts.
- [x] Implement server authorization, validation and persistence corrections.
- [x] Implement frontend session, realtime, audio and workflow corrections.
- [x] Provide fresh isolated Compose environment and idempotent fixtures.
- [x] Execute documented named reset, clean start/build, two identical-ID seeds and full stack stop/restart persistence comparison.
- [x] Patch dependencies, repair CI and container builds.
- [x] Run committed regression checks and integration permissions/invariants.
- [x] Execute browser workflows, muted audio/seek and responsive/keyboard checks.
- [x] Execute outage, concurrency and full restart persistence checks.
- [x] Reconcile every ledger entry with actual verification and limitations.
- [x] Prepare exact commands, account locations, URLs, walkthrough and honest readiness report.

## Continuation notes

2026-10-03: Docker 29.8.0 available with elevated local tool execution; no running containers initially. Native Node 24.13.1, .NET SDK 10.0.401. Git reads require per-call `-c safe.directory=<absolute repository>`, with no global config changes. All four repositories initially clean. Original evidence is outside writable roots and preserved.

Final verification: documented clean reset/start/build, two identical-ID seeds and complete stack restart passed with preserved credentials and exact durable-state/media fingerprints. The full documented command passed 56 backend tests (Identity 16/Music 21/User 19), 29 frontend units, all 21 browser workflows, type/lint/format/build, dependency gates, all four Docker builds, and 40 real PostgreSQL/Mongo/Mailpit Identity checks. Outage verification passed 26 checks plus two status CLI checks with every dependency restored. Windows frontend development lifecycle passed 21 checks including scoped owned-process teardown, foreign-listener refusal and container restoration. Runtime inspection confirmed nine loopback bindings, four nonroot application containers and exclusion of generated credentials from the frontend image. Environment generation passed 12 checks; CI report-shape regressions passed 27 checks and three actual dependency reports were validated locally. Remote CI was not triggered.

Four sanitized browser discovery artifacts retain the earlier failures and their corrections. A final test-only playback cleanup correction passed its changed case (1/1); the original full 21-case JSON is preserved with a SHA-256 comparison. Only four identified historical task-created playlists were removed, with 22 cleanup assertions confirming the seeded playlist, catalogue metadata and exact media bytes were unchanged. No database reset was used for that cleanup. Final desktop (1280px) and mobile (390px) UI inspections found no horizontal overflow; screenshots are versioned here. The temporary viewport override was reset.

The ledger covers 92 original audit IDs and 28 new issues: 112 fixed and verified, five mitigated for the local demo, three deferred production-only follow-ups, zero blocked and zero not applicable. The isolated single-instance local demo is verified. The exact development-only dependency exception expires 2026-10-17; Identity's .NET 8 migration is due before November 2026 support ends. Historical external credential revocation remains unverified. Generated credentials, assets and raw test results are ignored. Local commits contain the regression tests and delivery documents; no changes were pushed or deployed.
