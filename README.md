# Spotibuds Frontend

Spotibuds combines music discovery, personal collections and conversations with friends in a responsive web app.

**Next.js · React · TypeScript · ASP.NET Core · PostgreSQL · MongoDB · SignalR**

## The app in 76 seconds

Listen to an album, react to a friend's activity, build a collection and send a message from desktop to mobile. Play the recording below with sound.

https://github.com/user-attachments/assets/e77e37b6-90f7-4a4f-bab4-9d27be7a8e78

## Behind the experience

- **One player across the app.** Catalogue rows, feed posts and the expanded player share playback state. Album and artist navigation keeps the music playing; byte-range media delivery supports progressive playback and seeking.
- **Persistent social interaction.** SignalR delivers chat and notifications between independent sessions. Messages have persisted acknowledgements and read receipts; the recordings check history after reloading.
- **Separate services, shared contracts.** Identity handles accounts and sessions in PostgreSQL. Music owns the catalogue and playlists in MongoDB. User handles profiles, listening activity and friendships, also in MongoDB.
- **Sessions and loading states.** Access tokens stay in memory and refresh credentials use HttpOnly cookies. Independent page sections load separately, with request guards to prevent stale responses from replacing the current view.

## Explore the workflows

### Discover and listen · 1:54

Search songs, albums, artists and people. Open an album, play tracks, manage the queue and move through the app on mobile.

https://github.com/user-attachments/assets/46847f3f-ade7-4c8e-ab09-19c5ffa80536

### Favorites and playlists · 0:57

Save a song, create a playlist, add songs and albums, edit its cover and visibility, reorder tracks and check that changes survive a reload.

https://github.com/user-attachments/assets/a4ca6f5b-31b1-4037-a924-0c9cb51af75e

### Feed and listening profiles · 1:42

Play a song from a friend's listening activity, add or remove a reaction, see who reacted and follow the post into a listening profile. Weekly tracks, top artists and shared tastes appear in the same feed.

https://github.com/user-attachments/assets/71aa5a37-a19e-4dab-b31d-fbe0c263c614

### Friends, chat and notifications · 1:24

Send and respond to friend requests, then exchange messages between independent desktop and mobile sessions. Delivery, read receipts, saved history and inbox actions are shown in context.

https://github.com/user-attachments/assets/2e04e1f5-ab94-49f5-847f-b6135ca6d42f

### Accounts and administration · 1:46

Register, sign in, update a profile and avatar, change privacy settings and explore the administration screens. Catalogue writes and role changes are previewed without saving; the recording also shows unavailable email recovery.

https://github.com/user-attachments/assets/ddf68cbf-700a-4269-8efe-8535aeca6b93

## Source and local setup

| Repository                                        | Responsibility                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Frontend](https://github.com/Spotibuds/Frontend) | Next.js, React and TypeScript; shared player, navigation and session coordination     |
| [Identity](https://github.com/Spotibuds/Identity) | ASP.NET Core accounts, roles and refresh sessions; PostgreSQL                         |
| [Music](https://github.com/Spotibuds/Music)       | ASP.NET Core catalogue, playlists and media access; MongoDB and Azure Blob Storage    |
| [User](https://github.com/Spotibuds/User)         | ASP.NET Core profiles, feed, friendships, notifications and chat; MongoDB and SignalR |

The recorded deployment ran Docker services behind Caddy HTTPS on an Azure VM. The [local demo guide](https://github.com/Spotibuds/Frontend/tree/main/demo) starts the same service layout with generated credentials and audio fixtures; cloud credentials and production song downloads are not required. [Architecture and engineering details](https://github.com/Spotibuds/Frontend/tree/main/docs/portfolio).

## Verification and scope

The recorded source passed **234 frontend tests**, TypeScript checks, ESLint and a production build. **31 live checks** were repeated after recording. [Verification record](https://github.com/Spotibuds/Frontend/blob/main/docs/portfolio/showcase-verification.json).

The videos show actual browser interactions with existing catalogue music and synthetic participants. Listening scenes contain captured playback audio, and captions are visible in the footage. Mobile footage shows the responsive web app. Administration writes are previews; production recovery email still needs a relay. Device and load testing remain scoped rather than exhaustive.

[Recording files, captions and chapters](https://github.com/Spotibuds/Frontend/releases/tag/demo-suite-2026-10-05) · [Recorded feature index](https://github.com/Spotibuds/Frontend/blob/main/docs/demo-coverage.json).

## Work on the frontend

This repository is one of four sibling Git repositories. The complete isolated demo lives in [demo/README.md](demo/README.md); follow that guide to generate local secrets, start all dependencies, migrate, seed and verify the stack. Do not reuse historical cloud endpoints or credentials.

The frontend is at `http://127.0.0.1:3100`; Identity, Music and User use ports `5101`, `5102` and `5103`. All browser calls use those explicit build-time API URLs. Changing the URLs requires rebuilding the browser assets. The local token issuer is `spotibuds-local` and audience is `spotibuds-demo`; Identity issues the access token consumed by all services.

## Frontend development

Use Node 24 LTS and npm 11. Container builds pin Node 24.21.0. From this repository in PowerShell:

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

The `.env.local` file contains only public local API URLs. Secrets belong in the ignored demo environment file, never in `NEXT_PUBLIC_*` variables. Production-mode builds require all three API values and fail without them. The validation workflow builds/tests a container without publishing or deploying it.

```powershell
npm run type-check
npm run lint
npm run format:check
npm test
npm run audit:dependencies
npm run build
```

`npm test` runs session, JSON/multipart auth, hub lifecycle, audio navigation, accessible input and StrictMode regressions. After the complete demo is ready and seeded, run `npm run test:browser` for persisted UI workflows. It reads ignored fixture accounts and IDs, disables credential-bearing traces/video/screenshots, and writes ignored `test-results/browser-results.json`. It reuses installed Windows Chromium where available; elsewhere run `npx playwright install chromium` first. Keep the APIs running during these tests. The browser suite includes a real two-minute audio/now-playing check.

## Session and workflow behavior

Access tokens stay in memory. Refresh credentials stay in Identity's HttpOnly, SameSite Strict cookie. Cookie writes require the custom request header and exact local browser Origin. Expiry uses one refresh coordinator and one ten-second deadline for both phases. Login, logout and renewal share browser Web Locks so cookie mutations cannot overlap across tabs. Prepare installs a pending HttpOnly cookie without consuming its predecessor; complete consumes the predecessor only after the browser presents that installed successor, and does not write another cookie. Only a random operation ID and timestamp are retained for up to 30 seconds across navigation, so an interrupted phase can resume safely. No access or refresh credential enters storage. Consumed-predecessor replay still revokes the entire family. Requests retry a 401 once. Logout immediately clears local state, aborts old requests and stops playback/hubs. A token-free sign-out intent blocks automatic cookie renewal across reloads until an explicit successful login. If server revocation fails, the login page displays the actual failure and a bounded manual retry; it never reports that the server session was revoked. Blocked or full storage disables automatic bootstrap. Other tabs receive a token-free session-change event. Profile JSON in storage is a display hint, validated before authenticated navigation.

Registration requires an 8â€“100 character password containing upper and lower case, a digit, a symbol and six distinct characters. A synchronization-pending registration keeps the form and retries sign-in. Recovery is public and calls Identity; open the local Mailpit inbox described in the demo guide. Reset tokens are single use. Email changes are unavailable until a verified email-change workflow exists.

Private avatars and playlist covers are fetched with the shared authenticated client into revocable object URLs. Music playback uses catalogue-controlled local media endpoints. Failed writes retain form/draft data with error feedback. Chat waits for join and persisted acknowledgement, using an idempotent draft ID. History pages use bounded skip pagination and a terminal marker.

## Dependency exception and evidence

Next 16.3.8 and React 19.3.0 implement the current vendor security recommendations. The runtime dependency audit has zero advisories. One unpatched development-only `braces` advisory remains through Next's ESLint static glob dependencies: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The exact exception expires October 17, 2026. The gate rejects runtime findings, additional advisories, changed affected packages, newly available fixes, and expiry. npm's proposed downgrade to eslint-config-next 14.2.35 is rejected as a remediation strategy; that does not patch braces in the current supported Next toolchain. ESLint 9 is retained for Next's current React plugin compatibility; upgrade that toolchain together when its plugins support ESLint 10.

Current authoritative references: [Next September security release](https://nextjs.org/blog/september-2026-security-release), [React 19.3](https://react.dev/blog/2026/09/09/react-19-3), [Node release support](https://nodejs.org/en/about/previous-releases).

Per-audit frontend evidence is recorded in [docs/frontend-remediation.json](docs/frontend-remediation.json). The workspace-wide acceptance checklist and remediation ledger are in `docs/local-demo`. Production TLS/cookie Secure rollout, multiple replicas/backplanes, cloud access policies, production incident response and broader browser/load certification are follow-ups outside this isolated single-instance demo.
