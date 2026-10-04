# Notification audit and remediation

This audit follows the completed Chat/Friend work. Its evidence and commits are separate; historical test reports are preserved.

## Reproduced baseline

Three focused frontend regressions failed against the incumbent implementation: dismissing a read row reduced the unread badge; a confirmed read without its own hub echo left the badge unchanged; and a delayed first-account response replaced the second account's list. The incumbent page and dropdown owned separate snapshots, with additional chat listeners and synthetic context records. Deletion also emitted a browser event that could decrement counts twice.

Backend tracing found missing state invalidations for several mutations, non-idempotent handled timestamps, unstable timestamp-only pagination, publication of old keyed records, inconsistent expiry clocks, and notifications surviving deletion of their chat/account. Follow and reaction producers had no durable notification path. Active chat presence treated hidden tabs as active.

Real Mongo regressions exposed a shadowed `Notification.CreatedAt`: old documents held both `CreatedAt` and `createdAt`, with different values. Queries and indexes could disagree with the DTO timestamp. The startup migration atomically preserves the original producer timestamp in `createdAt`, removes the shadow field and repairs only the known obsolete named timeline index. Repeated migration/index initialization is tested; readiness waits for completion.

A held read acknowledgement reproduced another race: a later handle/dismiss could commit before readback, leaving an old row alongside current counts. The acknowledgement now reads the selected active row and counts in one database observation. An authoritative absent row disappears; an unavailable observation preserves the previous row with a visible synchronization retry.

Destination tests also reproduced double encoding of virtual feed IDs, missing `now_playing` song content, and delayed detail responses replacing a newer route. Detail loading decodes the route once, renders the existing song card for both supported song types, and guards completion against route/session changes. Reaction mutation remains in the existing Feed controls.

## Producers and lifecycle

| Producer | Recipient | Persistence and resolution | Destination |
| --- | --- | --- | --- |
| Friend request | Requested user | One canonical record for the request attempt; accepting, declining or canceling resolves that attempt | Friends |
| Acceptance / decline | Original sender | One response for the persisted terminal request | Friends |
| Friend removal | Other friend | One record for the persisted removal | Friends |
| Chat message | Other chat members without an active visible connection in that chat | Message and notice commit together; message retries reuse identity; chat reads update applicable notices; chat deletion removes notices | Actual chat |
| Follow | Followed user | New persisted edge produces a canonical keyed notice; repeated follow is idempotent; unfollow resolves it; repeated toggling does not spam | Public follower profile, or recipient's own profile when the follower is private |
| Reaction | Actual post author | Validated persisted or supported virtual post; self-reactions and removals create no notice; keyed actor/post lifecycle suppresses toggle spam | Supported feed post; a viewer-private comparison links the author's accessible weekly post |
| Identity / Music | None | Identity recovery email and Music catalogue operations are not in-app notification producers | Not applicable |

No ordinary-user API or hub method creates arbitrary notifications. Actor identity comes from validated claims; recipient, source, metadata and destination are derived or validated server-side. A missing/deleted parent aborts the transaction.

## State and delivery contract

Persisted ObjectIds identify every record. REST and SignalR use the same typed DTO. Active snapshots exclude dismissed and expired records and return items, total count and unread count from the same database snapshot and clock. Ordering is descending `(CreatedAt, Id)`, with an owned `before` anchor and bounded pages. Read-all and dismiss-all use an inclusive owned `throughId` boundary so later arrivals survive.

Read/handled timestamps change once. Dismissal retains a tombstone/key and is idempotent; account cleanup physically removes its graph. Committed changes invalidate recipient tabs, and count messages remain compatible. Delayed publication reloads current persisted state. A failed postcommit delivery/readback does not falsely report a rolled-back mutation; recipient snapshots recover the state.

The frontend has one account-scoped store and one managed notification connection. Page, dropdown and late subscribers share state. Owner/generation/request guards reject stale work; invalidations and reconnects refresh authoritative snapshots. Commands surface actionable failures, retain rows on failed dismissal, and wait for confirmed reads before navigating. Pending friend requests remain actionable after being read. Browser notification permission requires an explicit user gesture.

Account cleanup locks the same profiles as producers and deletes the related graph and notices in a transaction. Larger chat graphs progress in batches of 100 while retaining the profile until the final transaction. Avatar cleanup intent persists before profile removal. Surviving recipients receive invalidations after commit.

## Verification

The final User suite passed **74/74**, with zero failures/skips and no nullable/build warnings. It includes the existing 43 cases plus **17 notification contract/authorization/state cases, 11 producer cases and 3 account-cleanup cases**. These exercise actual Mongo transactions, HTTP authentication/middleware and SignalR clients. Injected persistence and transport failures verify rollback versus committed-success behavior; concurrent operations and delayed acknowledgements are controlled by gates.

The final frontend suite passed **110/110 in 13 files**, including 35 notification-store/presentation cases and four destination cases. Existing hub and chat tests also cover canonical subscriptions, reconnect, session ownership and visible-chat retries. TypeScript, zero-warning ESLint, complete formatting and whitespace checks passed. Both changed production Docker images built and all three APIs plus the frontend passed readiness checks. The last frontend image includes the revision-safe debounce cleanup: a successful current snapshot cancels its covered timer before calling listeners, while a newly raised invalidation still refreshes.

Commands executed from the workspace root:

```powershell
& ./Frontend/demo/Test-ChatFriends.ps1 -RunName notifications-ack-final
docker compose --project-name spotibuds-local-demo --env-file Frontend/demo/.env.localdemo -f Frontend/demo/compose.yml build user frontend
docker compose --project-name spotibuds-local-demo --env-file Frontend/demo/.env.localdemo -f Frontend/demo/compose.yml up -d --no-deps user frontend
node Frontend/demo/wait-ready.mjs
```

The final User-only and Frontend-only image rebuilds were also run after their last source changes. The backend script reads ignored credentials into memory and uses isolated test databases; it never resets the demo. Final raw TRX: `demo/results-chat-friends/notifications-ack-final/notifications-ack-final.trx`, SHA-256 `e9824023afe6520a7fd1765e728230b338685c77ef2dfd4fba7b14f9bad4d762`.

Commands executed from `Frontend`:

```powershell
npm test
npm run type-check
npm run lint
npm run format:check
npx playwright test --reporter=list,json --output=demo/results-notifications-final-confirmed/artifacts
```

The browser JSON destination is set with `PLAYWRIGHT_JSON_OUTPUT_NAME=demo/results-notifications-final-confirmed/report.json` only for that invocation and then restored, preserving the original report.

The broad run finished **24 passed / 3 failed / 0 skipped**. The history case explicitly displayed HTTP 429 after rapid hard navigation using the seeded Alice account. The existing lost-refresh-body navigation case also failed only in the burst runs; its precise causal path was not proven. Both passed when run in isolation. The new producer case timed out waiting for an optional idle-playback cleanup request in its fixture setup. Its setup now starts real music playback in the UI and uses SPA navigation to retain it, instead of awaiting that optional request. This changes the test setup, not application behavior.

After the final harness correction, the affected run passed **6/6, zero failures/skips** on the final production images:

```powershell
# From Frontend; JSON goes to demo/results-notifications-final-targeted/report.json.
npx playwright test -g 'two ordinary users receive canonical|read and dismiss synchronize tabs|notifications reject delayed snapshots|logout rejects delayed owner data|history loads real entries|hard navigation survives' --reporter=list,json --output=demo/results-notifications-final-targeted/artifacts
```

This verifies all four new notification scenarios plus both existing isolated workflows. Together with the 24 passing broad cases, **all 27 distinct browser scenarios have passing evidence on the final application images**; this is not a claim of a 27/27 green burst run. The normal User rate limit remains 300 requests per account per minute. The burst runner's reuse of seeded accounts remains a verification limitation; no rate limiter, authentication, CORS or ownership check was relaxed.

The new browser flows verify live canonical Follow/Reaction/Friend/Message notices, first-request reading and acceptance, persisted destinations, supported encoded feed IDs with HTTP 200, active visible-chat suppression without losing the actual message, synchronized tabs, rejected read/dismiss commands, bulk cutoffs, held old snapshots, 116 distinct notices across multiple pages after offline recovery, and logout/account-switch isolation. They also exercise mobile keyboard controls and long-text overflow. The reaction recipient is the ordinary seeded Alice; the other workflows use a fresh ordinary pair. Exact disposable accounts are removed in independent cleanup contexts, including when setup or UI teardown fails.

Actual restart verification passed with two fresh ordinary users:

```powershell
# From the workspace root; restarts only the named local User container.
node Frontend/demo/verify-notification-restart.mjs
node Frontend/demo/verify-delivery.mjs
```

An already connected SignalR client observed disconnect/reconnect with a different connection identity. Before/after snapshots retained the same persisted IDs, timestamps, order and read status, with two active rows and one unread. A new message reached the reconnected client with the canonical persisted notification ID; retrying the same message created no second row or live event. Both exact fixture accounts, their chat and notices were deleted and profile absence verified before a passed report was written. See `notification-runtime-verification.json`; combined sanitized totals are in `notification-verification.json`.

No required notification behavior was blocked by tooling. Multi-instance/cloud delivery and OS notification permission acceptance were not executed; desktop permission remained opt-in, with its blocked state verified. The optional Impeccable context-loader could not run in the restricted environment, so visual QA used the existing project context and the skill's documented fallback.

Manual computer-use checks used a separate fresh ordinary source and the ordinary demo Alice recipient. Three real persisted notices appeared live. Keyboard reading left a pending request actionable; accepting resolved it. A second read updated page, dropdown and badge consistently to one unread. Desktop and 390×844 mobile layouts retained usable controls, wrapped the long unbroken username and preview, and kept the inbox footer above the player. Escape closed the dropdown and restored bell focus. Saved evidence: `notification-ui-desktop.png`, `notification-ui-mobile.png`, `notification-ui-mobile-inbox.png`. The exact disposable source account, chat and notices were removed; the recipient account and unrelated data were retained.

Raw reports and account/session fixtures stay ignored. No traces, cookie/header dumps, credentials or signed URLs are delivered. The original 21-case browser JSON still has SHA-256 `51d67898a03d79f33063f09b1e8203fd58456d7ab2232641d01a560b8ffa47b2`.

## Changes by repository

- **User:** canonical notification entity/DTO/snapshot/commands and hub; idempotent owned operations, stable pagination and bulk boundaries; startup timestamp/index repair; transactionally validated Chat, Friend, Follow and Reaction producers; connection-scoped visible chat activity; chat/account graph cleanup and late-history protection; 31 new real-persistence regressions.
- **Frontend:** one owner-scoped notification store/provider and managed hub; shared page/dropdown rows and status; safe commands, synchronization/reconnect recovery, opt-in desktop alerts and accessible toast presentation; bounded history windows; visible-chat activity recovery; narrow feed destination fixes; 45 additional unit cases overall and four new browser scenarios; scoped restart/manual fixture tools and this evidence.
- **Identity / Music:** inspected producer/dependency paths. No notification source changes were needed. Existing account-cleanup and catalogue contracts remain in use.

The earlier Chat/Friend commits, reports and 21-case original browser evidence remain separate. Current tests include those existing regressions.

## Local and production limits

The target is the isolated local demo with a single User service, durable Mongo replica-set storage and real Chromium/SignalR clients. No deployment or cloud environment is included in this verification. There is no known remaining notification defect compromising that tested local configuration.

Horizontal deployment needs a SignalR backplane and shared active-chat presence; current presence is process-local. The service persists notifications before live publication and recovers through snapshots/reconnect, but it has no durable push-delivery outbox or background delivery retry. This proof does not establish delivery guarantees across arbitrary infrastructure outages or multiple User instances. Desktop OS alerts remain optional and depend on browser permission.

Notification lists expose bounded pages and at most 500 rows per visible window; older windows remain reachable. Follow/reaction attention is deliberately keyed by actor/recipient or actor/post, so repeated toggling does not create new attention. Dismissal retains the event key until the existing explicit retention cleanup or account cleanup; it is not an automatic archive service.
