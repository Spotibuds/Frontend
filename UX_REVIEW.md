# Spotibuds UI and music review

Reviewed on 4 October 2026 using Impeccable for interface craft and Intent for task flows and recovery. This is an implementation review with fixture-based browser evidence, not a live-service acceptance test or a user-research study.

## Changes

- A restrained charcoal and lavender system replaces decorative gradients, glass panels, oversized profile furniture, hover-only actions, and unsupported popularity labels. The existing logo stays in use. See [DESIGN.md](DESIGN.md).
- Home and music browsing have functional category filters, collection links, readable tracks, and visible playback actions. Search preserves room for titles and moves admin actions below results on phones.
- The player exposes seeking on desktop and mobile, with volume on desktop; its mobile dialog also exposes volume, shuffle, repeat, favorites, and queue. Context-aware album/playlist playback resumes matching paused music and starts the chosen collection when contexts differ.
- Favorites hydrate full saved membership, support removal, prevent duplicate pending operations, share concurrent collection creation, and reject stale account completions. New Liked Songs collections are private. The backend preserves canonical naming and returns an existing collection even at the playlist quota.
- The library lists up to the account quota, supports private/public creation and editing, confirms deletion, and supports ordering and removal with retryable undo. Album additions skip existing songs and report partial failures. The picker only expands truncated summaries when needed.
- Profile photo removal waits for persistence. Username updates use the server's `userName` property. Profile privacy and public playlist membership stay authoritative.
- Social pages use semantic links/buttons, preserve chat drafts, avoid forcing readers to the latest message, use ordinary feed scrolling, and expose recovery states. Dialogs lock background interaction and scrolling, trap focus, close with Escape, and restore focus. Navigation and notifications remain usable above connection notices.

## Surface inventory

All 28 page routes were inspected in source and rendered at 1440, 390, and 320 pixels, including aliases and redirects:

| Area           | Routes                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------- |
| Access         | `/`, `/register`, `/forgot-password`, `/reset-password`                                       |
| Listening      | `/dashboard`, `/music`, `/search`, `/album/[id]`, `/artist/[id]`                              |
| Library        | `/playlists`, `/playlists/[id]`, `/playlist/[id]`                                             |
| Social         | `/friends`, `/chat`, `/chat/[id]`, `/feed`, `/feed/post/[id]`, `/post/[id]`, `/notifications` |
| Profile        | `/user`, `/user/[id]`, `/user/edit`, `/user/[id]/listening-history`                           |
| Administration | `/admin`, `/admin/songs`, `/admin/artists`, `/admin/users`, `/admin/admins`                   |

The modal inventory includes the player, queue, song/album playlist pickers, library edit/delete, playlist detail edit/cover controls, profile friends/playlists, friend removal, mobile navigation, notification inbox, native catalogue create/update, shared search update, and destructive catalogue confirmations. Browser cases include keyboard entry, both Tab directions, Escape, focus restoration, background blocking, and layering. Native browser confirmations were inspected in source; destructive catalogue prompts were cancelled during browser review.

## Validation

- Frontend: **191 tests across 20 files pass**, including 27 added regression cases. ESLint passes with zero warnings. TypeScript and the production Next build pass.
- The full frontend CI formatting check passes. Local CRLF line endings were normalized in 55 files; Git's line-ending normalization leaves no additional source changes.
- Browser: 84 route/viewport captures, plus targeted corrections and modal/flow checks. Final merged evidence is `.impeccable/review/final-corrections/audit-final-report.json`. Screenshots/reports are ignored generated artifacts. Historical runs retain their failures; later reports identify the replacements instead of erasing earlier evidence.
- Browser fixtures verify favorite add/remove and reload, duplicate song exclusion, playlist editing and reload, queue add/clear, narrow layouts, focus, and modal layering. Fixtures never contact production accounts or services. The repeatable runner is [scripts/design-review.mjs](scripts/design-review.mjs); it accepts `REVIEW_BASE_URL`, `REVIEW_BROWSER`, `REVIEW_RUN`, and targeted `REVIEW_PHASE` values.
- Music backend restore and compilation pass. Two new persisted HTTP regression tests compile but **skip** because `MUSIC_TEST_MONGO` and `MUSIC_TEST_STORAGE` are absent. Docker's daemon is unavailable here.
- Live sign-in, audio streaming, backend persistence, SignalR delivery, and real account workflows remain unverified. Fixture transport failures are documented separately from interface failures.
- Impeccable's context launcher could not initialize its engine cache. Its instructions were read directly; the automated design detector was unavailable. Source review, rendered checks, and an independent finish review supplied the available evidence.

## Repository and local work

All four repositories started this change at the fetched `origin/main`: Frontend `0def870`, Identity `24838b8`, Music `5dd513d`, User `60fd4a7`. Existing local files were backed up outside the repositories. Older runtime upgrades and service guards were superseded by current main; local bootstrap/import tooling stays outside this release. All 18 backed-up Telegram script files were compared against their preserved workspace copies and match. The downloader folder is excluded from Git and Docker build context. Infrastructure scripts were left in place. This release includes Frontend and Music changes.

## Playback follow-up

The home player already had desktop seeking; its mobile CSS hid the line. The
line is now visible and seekable at both sizes, with distinct played/buffered
extents. The desktop navigation layer no longer covers track information.
Pause remains available while buffering.

Current audio streams immediately. The next known song receives a native metadata
preload after current audio has ten seconds buffered, respects reported data saving,
and reuses the warmed media element. A matching warmup survives the final seconds
of a song; waiting does not restart the current download. Stale play rejections
cannot stop a newer track. Queue order takes priority; shuffle is not guessed.

The Music upload path removes leading MP3 ID3 artwork/metadata without changing
MPEG audio bytes. Existing uploads require the backup-preserving repair tool;
see [Music playback notes](https://github.com/Spotibuds/Music/blob/main/docs/playback-startup.md).

Updated validation: **200 frontend tests**, TypeScript, zero-warning ESLint and
the production build pass. Music has **22 passing tests and 7 dependency skips**;
the Python repair tool has **2 passing tests**. The playback browser runner
(`scripts/playback-review.mjs`) verifies native generated-WAV playback, home seeking,
buffer display, next-song element reuse, and uncovered controls at 1440, 390 and
320 pixels. Final evidence is `.impeccable/review/playback/results.json`.
The live repair tool audit read one affected track and performed zero writes.
The UI and playback changes were deployed to Azure on 4 October 2026. Live API
checks covered cookie refresh, catalogue preservation, ranged audio delivery,
favorites persistence, playlist transactions and cross-account protection.
Existing MP3 metadata optimization has not been run. Legacy artwork MIME headers
were corrected after verifying image signatures; artwork and audio bytes stayed intact.
Live validation also found and fixed explicit login racing an anonymous cookie
bootstrap, and desktop navigation becoming an open mobile drawer after resizing.
