<h1 align="center">Spotibuds</h1>

<p align="center">Discover music, make it yours and share it with friends.</p>

<p align="center"><img src="docs/portfolio/product-preview.gif" width="720" alt="Silent preview of album playback, a feed reaction and desktop-to-mobile chat"></p>

<p align="center">Albums and playback · Favorites and playlists · Listening feed · Friends and live chat</p>

## Watch the app in action

Play a recording below and unmute to hear the music. All six demos are visible on this page.

### Overview · 1:16

Listen, collect, react and chat across desktop and mobile in 76 seconds.

https://github.com/user-attachments/assets/e77e37b6-90f7-4a4f-bab4-9d27be7a8e78

### Discover and listen · 1:54

Search music and people, explore artists and albums, and control playback and the queue on desktop and mobile.

https://github.com/user-attachments/assets/46847f3f-ade7-4c8e-ab09-19c5ffa80536

### Favorites and playlists · 0:57

Save favorites, create a playlist, edit its cover and visibility, reorder tracks and check persistence after reload.

https://github.com/user-attachments/assets/a4ca6f5b-31b1-4037-a924-0c9cb51af75e

### Feed and listening profiles · 1:42

Play from the listening feed, react to activity, see who reacted and explore listening profiles and shared tastes.

https://github.com/user-attachments/assets/71aa5a37-a19e-4dab-b31d-fbe0c263c614

### Friends, chat and notifications · 1:24

Send and accept friend requests, exchange messages between desktop and mobile, and check receipts, saved history and notifications.

https://github.com/user-attachments/assets/2e04e1f5-ab94-49f5-847f-b6135ca6d42f

### Accounts and administration · 1:46

Register, edit profiles, avatars and privacy, and preview administration screens. Catalogue writes and role changes are not saved.

https://github.com/user-attachments/assets/ddf68cbf-700a-4269-8efe-8535aeca6b93

## The implementation, briefly

Next.js, React and TypeScript on the frontend. Three ASP.NET Core services separate identity, music and social activity. PostgreSQL stores accounts; MongoDB stores catalogue and social data. SignalR delivers live chat and notifications. Docker services run behind Caddy, with media in Azure Blob Storage.

- One player keeps its state across views; byte-range media delivery supports progressive playback and seeking.
- Messages persist on the server, with delivery acknowledgements and read receipts between independent sessions.
- Access tokens stay in memory; refresh credentials use HttpOnly cookies.

## Verification and setup

The recorded source passed **234 frontend tests**, TypeScript checks, ESLint and a production build, followed by **31 live checks**. [Verification record](https://github.com/Spotibuds/Frontend/blob/main/docs/portfolio/showcase-verification.json).

Actual browser recordings with existing catalogue music and synthetic participants. Mobile footage shows the responsive web app. Captions are visible in the footage and listening scenes include captured music. Administration writes are previews; production recovery email needs a relay. Device and load testing remain scoped.

[Run locally](https://github.com/Spotibuds/Frontend/tree/main/demo) · [Architecture and source](https://github.com/Spotibuds/Frontend/tree/main/docs/portfolio) · [Recordings, captions and chapters](https://github.com/Spotibuds/Frontend/releases/tag/demo-suite-2026-10-05)

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
