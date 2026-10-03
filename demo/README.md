# Spotibuds isolated local demo

Run these commands in PowerShell from the workspace containing the four sibling repositories (`Frontend`, `Identity`, `Music`, `User`). This setup uses only fresh local credentials and the named Docker Compose project `spotibuds-local-demo`.

## Prerequisites

Docker Desktop with Linux containers and Compose v2, PowerShell 7, Node 24 LTS with npm 11, and .NET SDK 10 plus the .NET/ASP.NET 8 runtime for Identity tests. Identity targets .NET 8; Music and User target .NET 10. No cloud account is required. Container builds use the repository lockfiles. Internet access is needed to fetch public base images and packages initially. Identity's .NET 8 migration is a production follow-up before its November 2026 support deadline.

## Generate, start, seed

```powershell
pwsh -File Frontend/demo/New-LocalEnvironment.ps1
pwsh -File Frontend/demo/Demo.ps1 -Action start
pwsh -File Frontend/demo/Demo.ps1 -Action seed
```

Environment generation preserves an existing environment. Fresh random credentials are written to ignored `Frontend/demo/.env.localdemo` and `Frontend/demo/accounts.local.json`; these files are excluded from Docker build contexts. Read the account file locally to sign in. Do not commit or copy it into reports. Accounts are `demoadmin` (Admin), `alice`, `bob`, and `mallory` (User). Registration always creates an ordinary User. Bob's profile and `Private Focus` playlist are private; Alice's `Demo Favorites` playlist and profile are public.

Seeding is idempotent and checks persisted song/playlist uniqueness. It generates original PNG covers/avatars and playable PCM WAV tones: `Morning Loop` (12 seconds) and `Long Horizon` (125 seconds). It creates an artist, album, ordered playlists, Alice/Bob friendship/follows, chat messages, and listening history. No fixture URL rewriting or downloaded copyrighted assets is used.

## URLs and service names

| Purpose | Host URL | Internal URL |
| --- | --- | --- |
| Frontend | http://127.0.0.1:3100 | http://frontend:3000 |
| Identity | http://127.0.0.1:5101 | http://identity:8080 |
| Music | http://127.0.0.1:5102 | http://music:8080 |
| User | http://127.0.0.1:5103 | http://user:8080 |
| Recovery inbox | http://127.0.0.1:8025 | mailpit:1025 (SMTP) |
| PostgreSQL | 127.0.0.1:55432 | postgres:5432 |
| Mongo replica set | 127.0.0.1:57017 | mongo:27017 |
| Redis | 127.0.0.1:56379 | redis:6379 |
| Azurite Blob | http://127.0.0.1:10000 | http://azurite:10000 |

Use `127.0.0.1` consistently. CORS is explicitly limited to that frontend origin. Every exposed port binds to loopback. Mongo uses an authenticated single-node replica set for transactions; host-side tests use `directConnection=true` because the advertised internal hostname is `mongo`.

## Build and test

```powershell
npm.cmd --prefix Frontend ci
npm.cmd --prefix Frontend exec -- playwright install chromium
pwsh -File Frontend/demo/Test.ps1 -Browser -BuildImages
node Frontend/demo/outage-restart-integration.mjs
pwsh -NoProfile -File Frontend/demo/Test-FrontendDevelopment.ps1
node Frontend/demo/inspect-runtime.mjs
node Frontend/demo/verify-delivery.mjs
```

`Test.ps1` builds and runs committed backend tests, frontend type/lint/format/unit/build checks, dependency checks, full-stack Identity checks, and optional browser/image checks. Backend Mongo tests create and remove only random databases with their own test prefix. The outage script stops only this named demo project's dependencies, restores them in a `finally` block, and checks cold Redis, storage/database failures, recovery, byte ranges, and persisted state after API restart. The Windows development lifecycle check stops only the frontend container, verifies anonymous rendering/local configuration and process-ownership guards, then restores the container frontend. It needs a session permitted to inspect local process/network ownership. Avoid using the UI while either explicit interruption check runs.

To rebuild/start without deleting data, use `Demo.ps1 -Action start`. A standalone frontend build requires all three explicit `NEXT_PUBLIC_*_API` values; the script sets the local values. `NEXT_PUBLIC_*` values are compiled into the browser bundle and require a rebuild when changed.

For frontend hot reload, keep the APIs running and stop only the frontend container before starting Next locally:

```powershell
docker compose --project-name spotibuds-local-demo --env-file Frontend/demo/.env.localdemo -f Frontend/demo/compose.yml stop frontend
$env:NEXT_PUBLIC_IDENTITY_API='http://127.0.0.1:5101'
$env:NEXT_PUBLIC_MUSIC_API='http://127.0.0.1:5102'
$env:NEXT_PUBLIC_USER_API='http://127.0.0.1:5103'
npm.cmd --prefix Frontend run dev
```

Stop the local Next process with Ctrl+C. On Windows, if its child keeps port 3100 occupied, run the scoped fallback before restoring the container:

```powershell
pwsh -File Frontend/demo/Stop-FrontendDevelopment.ps1
pwsh -File Frontend/demo/Demo.ps1 -Action start
```

The fallback verifies that the listener and its parent belong to this workspace's Next development command. It refuses a foreign listener or uncertain inspection and stops only the verified development process. If Ctrl+C already freed the port, the helper is a no-op. Both frontend modes use the same loopback origin and API contract.

## Stop, restart, inspect, reset

```powershell
pwsh -File Frontend/demo/Demo.ps1 -Action status
pwsh -File Frontend/demo/Demo.ps1 -Action stop
pwsh -File Frontend/demo/Demo.ps1 -Action restart
pwsh -File Frontend/demo/Demo.ps1 -Action reset -DestroyDemoData
pwsh -File Frontend/demo/Demo.ps1 -Action start
pwsh -File Frontend/demo/Demo.ps1 -Action seed
```

Stop/restart preserves the named PostgreSQL, Mongo, Redis, Blob, and Mailpit volumes. Reset deletes only `spotibuds-local-demo` resources and the ignored fixture ID file, and requires the explicit destruction switch. It preserves the generated credential files so subsequent startup and seeding agree. Never delete unrelated containers or volumes.

To assert persisted fixture state across a full stack restart, run `node Frontend/demo/snapshot-persistence.mjs capture` before stop/restart and `node Frontend/demo/snapshot-persistence.mjs verify` afterwards. This compares profiles, roles, ordered playlists, history, chat IDs/content hashes and exact media hashes. Its ignored baseline contains no tokens or account credentials. Avoid simultaneous demo mutations during that comparison.

## UI walkthrough

1. Open the frontend and sign in as Alice. Open `Demo Favorites`, play a track with volume muted, pause/resume and seek. Try next/previous, queue, repeat and shuffle. Play `Long Horizon` to exercise the now-playing heartbeat past its original 90-second lifetime.
2. Edit Alice's display name/bio, clear them, change privacy, and upload a valid avatar. Refresh to check persisted values. Sign out during playback; playback and Alice-specific state must stop. Sign in as Mallory and inspect the private-profile and private-playlist denial.
3. Use two independent browser sessions for Alice and Bob. Open their seeded chat, send messages immediately after connecting, reconnect and send again, and inspect receipts and notifications. During a disconnected send, the draft must remain with a visible failure.
4. Browse/search the public catalogue, follow/unfollow a user, inspect friend requests, feed reactions, history and weekly artists. Blank search must clear old results.
5. Sign in as `demoadmin` to create/edit/rename an artist, album and song using the generated assets in `Frontend/demo/assets`; inspect relationships and clean up that test catalogue through the admin UI.
6. Sign out and open Forgot Password. Submit a local account's email, open Mailpit, and follow the delivered expiring single-use link. Recovery tests use a disposable account so the documented demo credentials remain valid.

## Contracts and limits

Identity owns username, email, privacy and roles; User owns display name, bio, avatar, social data and listening history. A unique Identity GUID links the stores. Pending reconciliation is durable and visible instead of claiming completed writes. Disabled/deleted accounts cannot renew or use existing authenticated sessions. Account deletion is retried until User relations, playlists and media cleanup are reconciled.

Identity account IDs, JWT subjects and playlist `createdBy` values are GUIDs. User profiles expose a MongoDB ObjectId `id` plus the GUID `identityUserId`; profile lookup and batch endpoints accept either. Catalogue, playlist, friendship, chat, message and notification document IDs are 24-character ObjectId strings. Chat DTO participants/senders and notification recipient/source fields use Identity GUIDs. Internal friendship and chat membership records link Mongo profile IDs and map them to GUIDs in their DTOs; do not treat every returned user ID as interchangeable.

Private profile/history/avatar/social graph and private playlist detail/media are readable only by their owner or Admin. Search/batch may return a minimal private-account identity summary. Accepted friends may start a direct chat with a private account; this does not grant access to the private profile. All writes derive the actor from validated JWT claims. Access tokens remain in browser memory; refresh tokens use a Strict HttpOnly local cookie and are hashed in PostgreSQL. Session checks fail closed when Identity is unavailable.

Browser renewal first prepares a successor cookie (`/api/auth/refresh/prepare`, 204), then activates that already installed cookie (`/api/auth/refresh/complete`, 200 session response without another cookie mutation). Both steps share a random request UUID and a bounded 30-second handoff. A hard navigation can resume an interrupted handoff without relaxing consumed-credential replay revocation. Browser storage holds only the coordination UUID/time, never a token. The legacy one-step `/api/auth/refresh` remains available for API clients with strict single-use rotation.

Login, renewal and logout share a bounded browser lock. Local logout stops playback and connections immediately and persists a token-free sign-out intent. If server revocation fails, the sign-in screen reports the pending revocation and offers an explicit retry; reload does not silently restore the account. Only a validated explicit login clears that intent. When browser storage is unavailable, automatic reload sign-in fails closed and explicit sign-in is required.

The local HTTP cookie exception applies only in Development on loopback. Production requires HTTPS and Secure cookies. Weekly history windows run Sunday 00:00 UTC through the next Sunday, exclusively; history events retain 90 days. Weekly summaries are computed from durable events rather than an embedded 100-item cap or stale weekly cache. Catalogue media uses stable authenticated/validated proxies and private Blob containers, never persisted signed URLs.

This is a single-instance demo. Presence, active chat, now-playing and live event routing require distributed coordination before scaling User replicas. Persisted messages/notifications remain authoritative when a live delivery is interrupted. RabbitMQ's dormant consumer was removed; this demo makes no broker delivery claim. Avatar cleanup intents retry with bounded backoff; exhausted intents require operator inspection/retry. The local recovery inbox is not an external email-delivery guarantee. Email confirmation, production backups/restore drills, secret revocation outside this environment, cloud policy, distributed delivery, load tests and broader browser coverage remain production follow-ups.

## Troubleshooting

`/health/live` checks the process. `/health/ready` checks required state/dependencies and returns 503 while unavailable or initializing. The status command also checks frontend reachability. Check Docker Desktop and port availability first, then inspect only the named project's service logs. Do not print environment values, bearer/cookie tokens, recovery links, or raw user content into evidence.

If Mongo is healthy but host tests cannot discover it, use the documented direct connection option. If a local password is changed manually, update only that account's ignored local credential entry before reseeding. For fresh schema/index incompatibility, reset only the disposable demo resources; never point these scripts at an existing database. Verification evidence and every audit ID's disposition are recorded under `Frontend/docs/local-demo/`.
