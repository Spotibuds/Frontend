# Spotibuds Frontend

Spotibuds is a social music app built with Next.js, TypeScript and C# services. Listen to music, save collections, discover listening activity and chat across desktop and mobile.

[![Spotibuds listening on desktop and chatting on mobile](docs/portfolio/preview.jpg)](https://spotibuds.github.io/.github/#overview)

**[Watch the 1:16 overview with sound](https://spotibuds.github.io/.github/#overview)** · [Organization showcase](https://github.com/Spotibuds) · [Architecture and setup](docs/portfolio/README.md)

## Explore the demos

Watch directly in your browser with sound, captions and chapter navigation. No download or account is needed; the recordings are hosted independently of the app server.

| Video                                                                           | Length | Workflows                                                                                                 |
| ------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| [Overview](https://spotibuds.github.io/.github/#overview)                       | 1:16   | Audible listening, reactions, collections and independent desktop/mobile chat                             |
| [Discover and listen](https://spotibuds.github.io/.github/#discover)            | 1:54   | Home, catalogue paging, music/people search, playback, queue, album/artist links and mobile navigation    |
| [Favorites and playlists](https://spotibuds.github.io/.github/#favorites)       | 0:57   | Favorites, creation, covers, visibility, album/song additions, order, persistence and disposable deletion |
| [Feed and listening profiles](https://spotibuds.github.io/.github/#feed)        | 1:42   | All five feed cards, navigation, playback, reactions, profiles, post links and listening history          |
| [Friends, chat and notifications](https://spotibuds.github.io/.github/#friends) | 1:24   | Request/cancel/decline/accept, profile messaging, delivery, receipts, saved chats and inbox actions       |
| [Accounts and administration](https://spotibuds.github.io/.github/#accounts)    | 1:46   | Registration, profile/avatar/privacy, sign-in/out, recovery limits and administration previews            |

Recorded on the deployed app with existing music and independent synthetic accounts. Listening footage includes actual playback audio; other scenes have no added soundtrack. Videos are 1080p MP4 with readable captions, matching SRT files and chapter timestamps. [All videos, captions and verification](https://github.com/Spotibuds/Frontend/releases/tag/demo-suite-2026-10-05) · [Feature coverage plan](docs/demo-coverage.md) · [Recorded action index](docs/demo-coverage.json).

Catalogue and account administration changes are previewed or canceled. Production password recovery explicitly reports its missing email relay. Videos are release attachments; credentials, song downloads and downloader code are excluded from Git history.

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

Registration requires an 8–100 character password containing upper and lower case, a digit, a symbol and six distinct characters. A synchronization-pending registration keeps the form and retries sign-in. Recovery is public and calls Identity; open the local Mailpit inbox described in the demo guide. Reset tokens are single use. Email changes are unavailable until a verified email-change workflow exists.

Private avatars and playlist covers are fetched with the shared authenticated client into revocable object URLs. Music playback uses catalogue-controlled local media endpoints. Failed writes retain form/draft data with error feedback. Chat waits for join and persisted acknowledgement, using an idempotent draft ID. History pages use bounded skip pagination and a terminal marker.

## Dependency exception and evidence

Next 16.3.8 and React 19.3.0 implement the current vendor security recommendations. The runtime dependency audit has zero advisories. One unpatched development-only `braces` advisory remains through Next's ESLint static glob dependencies: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The exact exception expires October 17, 2026. The gate rejects runtime findings, additional advisories, changed affected packages, newly available fixes, and expiry. npm's proposed downgrade to eslint-config-next 14.2.35 is rejected as a remediation strategy; that does not patch braces in the current supported Next toolchain. ESLint 9 is retained for Next's current React plugin compatibility; upgrade that toolchain together when its plugins support ESLint 10.

Current authoritative references: [Next September security release](https://nextjs.org/blog/september-2026-security-release), [React 19.3](https://react.dev/blog/2026/09/09/react-19-3), [Node release support](https://nodejs.org/en/about/previous-releases).

Per-audit frontend evidence is recorded in [docs/frontend-remediation.json](docs/frontend-remediation.json). The workspace-wide acceptance checklist and remediation ledger are in `docs/local-demo`. Production TLS/cookie Secure rollout, multiple replicas/backplanes, cloud access policies, production incident response and broader browser/load certification are follow-ups outside this isolated single-instance demo.
