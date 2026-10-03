# Spotibuds remediation ledger

Isolated single-instance local demo. Updated 2026-10-03.

All 92 original audit IDs are retained with their original evidence. Newly encountered issues are counted separately. Verification statements describe the recorded checks; remaining limitations qualify each disposition.

| Disposition | Original audit IDs | Encountered during task | Total |
| --- | ---: | ---: | ---: |
| Fixed and verified | 84 | 28 | 112 |
| Fixed, verification blocked | 0 | 0 | 0 |
| Mitigated for the local demo | 5 | 0 | 5 |
| Deferred: production-only follow-up | 3 | 0 | 3 |
| Not applicable, with evidence | 0 | 0 | 0 |
| **Total** | **92** | **28** | **120** |

Original audit: 73 findings and 19 risks/dormant items. Machine-readable evidence and contributor provenance: [remediation-ledger.json](remediation-ledger.json).

## Original audit dispositions

### F-01: Every normal playlist mutation omits authentication

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

In-memory execution with a stored token recorded eight playlist write requests and eight missing Authorization headers. Backend endpoints require Authorize. Real logged-in UI playlist creation failed; error logged only to console, form stays open with no visible error. Root real API token/no-token tests confirm the missing-header401.

**Planned correction:**

Route all playlist requests through one authenticated request client supporting JSON and multipart bodies; propagate structured errors into the form.

**Implemented correction or mitigation:**

Frontend: All playlist JSON and multipart mutations use the shared authenticated request client. Exact-order persistence uses the reorder endpoint; full playlist details are fetched before playback and membership checks. Errors retain drafts.

**Changed files:**

- Frontend/src/lib/request.ts
- Frontend/src/lib/playlist.ts
- Frontend/src/lib/api.ts
- Frontend/src/components/PlaylistManager.tsx
- Frontend/src/components/PlaylistCoverUploader.tsx
- Frontend/src/app/playlists/[id]/page.tsx
- Frontend/tests/session.test.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Unit authenticated writes/multipart/204 tests pass.
- Live Chromium create/edit/reload, cover/reorder/reload/removal and authenticated deletion cleanup passed in the 2026-10-03 stable run.

**Remaining limitations:**

- Foreign/anonymous authorization is independently verified by Music tests; see Music/docs/remediation.json.

### F-02: Failed token refresh leaves the user record behind

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Isolated runtime returned401 then refresh400: token and refreshToken removed, currentUser remained, navigation became '/'. Login stores currentUser; failure handlers remove user. The login page sees stale currentUser and sends the user to dashboard.

**Planned correction:**

Use one session store and one clearSession routine consistently; login redirects only for validated session.

**Implemented correction or mitigation:**

Frontend: A single clearSession clears memory access, legacy credentials, user hints and request/hub/audio ownership. Login redirects only after validated refresh/me.

**Changed files:**

- Frontend/src/lib/session.ts
- Frontend/src/lib/request.ts
- Frontend/src/app/page.tsx
- Frontend/src/components/layout/AppLayout.tsx
- Frontend/tests/session.test.ts

**Regression tests and verification:**

- Unit failed-refresh and terminal401 checks verify all credential/profile keys cleared.
- Live UI reload retains validated session without token persistence; sign-out clears profile and returns to login.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### F-03: Refresh can resurrect a session after logout and retry without a limit

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Mock execution of refresh in flight followed by logout restored token and refreshToken and returned the old user after logout. A single API operation receiving three consecutive401s refreshed three times and made four original attempts. Logout performs zero server requests despite revoke endpoint. TokenCheck and three hubs each implement independent refreshes outside apiRequest's queue.

**Planned correction:**

Centralize refresh into one shared promise with timeout and session generation/cancellation; permit exactly one401 retry; invalidate in-flight work and revoke the refresh session on logout.

**Implemented correction or mitigation:**

Frontend: One generation-aware coordinator uses abortable browser Web Locks, one ten-second deadline and two refresh phases. Prepare installs a pending HttpOnly cookie before completion consumes its predecessor; completion does not write another cookie. Only a bounded operation UUID/time is stored for navigation recovery. Logout/account switch abort old work and clear pending ownership; protected API retries one 401. Login, logout and renewal share the same bounded cookie-operation lock. A persisted token-free sign-out intent blocks cookie bootstrap until an explicit successful login; failed revocation remains visible with a manual bounded retry.

**Changed files:**

- Frontend/src/lib/session.ts
- Frontend/src/lib/request.ts
- Frontend/src/lib/managedHub.ts
- Frontend/tests/session.test.ts
- Frontend/src/lib/api.ts
- Frontend/src/app/page.tsx
- Frontend/src/lib/audio.tsx

**Regression tests and verification:**

- Unit concurrent refresh coalescing, delayed refresh after logout, repeated401 termination pass.
- Live reload and logout lifecycle pass.
- New unit cases verify interrupted completion/module-reload reuse, expired-marker replacement, old completion cannot overwrite a new account, and both phases share one ten-second deadline. All 21 frontend unit cases pass.
- Actual staged-protocol Chromium loses prepared Set-Cookie and completion body in two hard-navigation modes; both resume the pending operation, load protected playlists, reload successfully, store no tokens and sign out without stale ownership. Focused catalogue create/edit/delete also passes on staged renewal.
- 29-unit suite covers logout503/reload, failed versus successful explicit login, quota recovery after cleanup, blocked storage, cross-tab sign-out, delayed logout/login ordering and same-intent acknowledgement.
- Final complete documented run8951 PASS21/21 Chromium workflows (0skip/flaky); frontend29 units/type/lint/format/build/dependency checks passed. See docs/frontend-browser-verification.json.

**Remaining limitations:**

- Full final21-case clean-stack run remains root-owned; consumed-parent replay is independently verified by Identity tests.

### F-04: Password recovery is inaccessible and only simulates success

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Anonymous local browser clicked Forgot password and saw 'Please log in to continue'. The route is excluded from the auth-page list. Even when accessible logged-in, form waits one second and setsSuccess without an API call, while claiming a reset link was sent. Screenshot frontend-recovery-blocked.png.

**Planned correction:**

Make recovery public and implement server-issued expiring single-use reset tokens and actual delivery; otherwise disclose unavailability and remove the misleading success promise.

**Implemented correction or mitigation:**

Frontend: Recovery routes are public; real Identity recovery uses isolated Mailpit delivery. Invalid/expired link and password-policy errors are shown; successful reset removes token query.

**Changed files:**

- Frontend/src/app/forgot-password/page.tsx
- Frontend/src/app/reset-password/page.tsx
- Frontend/src/components/layout/ConditionalAppLayout.tsx
- Frontend/src/lib/api.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Live anonymous forgot-password submits to actualAPI and generic status; invalid reset is rejected.
- Identity recovery single-use/expiry/password change verified by its live suite.
- Actual public UI registration, local Mailpit capture, password reset, new-password login, old-password rejection and used-link rejection passed.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### F-05: Chat draft is erased even when sending fails

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Disconnected ChatHub.sendMessage resolved undefined instead of rejecting in runtime harness; invocation errors are caught and swallowed. Chat page awaits it then clears input regardless. The page's isConnected value comes from FriendHub rather than ChatHub.

**Planned correction:**

Throw/return explicit send outcomes, retain draft until confirmed, tie send enablement to ChatHub state, use an idempotent client message ID and acknowledgement.

**Implemented correction or mitigation:**

Frontend: ChatHub state and successful room join govern send. Stable client message IDs and actual server acknowledgement clear the draft only on success.

**Changed files:**

- Frontend/src/lib/chatHub.ts
- Frontend/src/app/chat/[id]/page.tsx
- Frontend/tests/hubs.test.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Live direct chat acknowledgement renders exactly once and persists after reload; rejected4001-character message retains draft.
- Two independent UI users offline/online: disconnected draft retained, accepted after reconnect, delivered once.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### F-06: Initial chat join race hides persisted messages until refresh

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Real browser direct-navigation to Bob chat logged 'ChatHub not connected, cannot join chat' before connected. Sending synthetic message cleared draft but displayed nothing. REST confirmed message persisted. Browser refresh then displayed it. Initial join returns before assigning currentChatId; only onreconnected rejoins, initial start does not. Server broadcasts to chat group and never emits the MessageSent event the frontend expects. Screenshots before/after refresh saved.

**Planned correction:**

Retain desired chatId independently, join on every transition to Connected including first start, await successful join before enabling send, send an explicit caller acknowledgement.

**Implemented correction or mitigation:**

Frontend: Desired room survives initial start and reconnect. Late subscribers immediately receive existing connection state and joined room.

**Changed files:**

- Frontend/src/lib/chatHub.ts
- Frontend/src/lib/managedHub.ts
- Frontend/src/app/chat/[id]/page.tsx
- Frontend/tests/hubs.test.ts

**Regression tests and verification:**

- Unit shared initial startup, desired room join and late-connected subscriber pass.
- Two users see initial and post-offline-reconnect messages and read receipts without refresh.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### F-07: Hub enable/disconnect lifecycle can orphan live connections

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Runtime harness calling chatHub.enableConnection twice built two connections and stopped zero. disableConnection with state Reconnecting stopped zero and dropped its reference. NotificationHub uses identical pattern. AppLayout initializes in a mount effect without connection cleanup; development StrictMode/remounts can repeat enable.

**Planned correction:**

Make enable idempotent/shared start promise; stop any non-Disconnected connection including Reconnecting, await disable, cancel timers, clean up layout mount and namespace handlers by session.

**Implemented correction or mitigation:**

Frontend: Shared idempotent start/stop promises and session generation cancel connecting/reconnecting hubs; page subscriptions and layout handlers are cleaned up.

**Changed files:**

- Frontend/src/lib/managedHub.ts
- Frontend/src/lib/chatHub.ts
- Frontend/src/lib/notificationHub.ts
- Frontend/src/lib/friendHub.ts
- Frontend/src/hooks/useFriendHub.ts
- Frontend/src/components/layout/AppLayout.tsx
- Frontend/tests/hubs.test.ts

**Regression tests and verification:**

- Unit one connection for concurrent starts and cancellation during Connecting pass.
- Real browser two-user reconnect/rejoin and logout pass.

**Remaining limitations:**

- Multi-replica connection/backplane behavior is a production follow-up.

### F-08: Audio continues across logout and end-of-playlist state is wrong

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

AudioProvider stays above route/layout for login and authenticated pages; logout neither pauses nor resets audioState. Ended dispatches NEXT_SONG but no PAUSE at last index; getNextIndex returns same index with repeat off, leaving isPlaying true. Playlist detail plays first song as single-song playlist with remaining songs in queue; queue end can reset to first track instead of ending.

**Planned correction:**

Add session-aware stop/reset and clear/namespace persisted audio; explicit ended transition stops at queue/playlist end and uses correct playlist index.

**Implemented correction or mitigation:**

Frontend: Session-aware native audio stop/reset, namespaced persisted state, bounded queue/history, correct repeat/end/index transitions. Native same-track repeats reload using playbackRevision.

**Changed files:**

- Frontend/src/lib/audio.tsx
- Frontend/src/lib/audioState.ts
- Frontend/src/components/layout/AppLayout.tsx
- Frontend/tests/audio.test.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Reducer final/repeat/queue/history/reset tests pass.
- Live media plays with native readyState4 and advancing currentTime; logout pauses and removes src.
- Actual native seek near 40 seconds, previous/next tracks, repeat restarting the same track, shuffle visiting both tracks, and final finite-queue pause passed in a focused Chromium run.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### F-09: Now-playing status expires during ordinary long tracks

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Frontend sends only one update two seconds after song/play changes. CurrentTime is intentionally omitted from effect deps; no heartbeat. Default TTL is90seconds, clamped by server.

**Planned correction:**

Send a cancellable heartbeat below TTL while playing, update position from a ref and clear on pause/logout.

**Implemented correction or mitigation:**

Frontend: Cancellable30-second now-playing heartbeat reads native position; paused/logout state clears it.

**Changed files:**

- Frontend/src/lib/audio.tsx
- Frontend/src/lib/session.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Live125-second local track played uninterrupted to120seconds; now-playing still present, position&gt;=89 seconds and updatedAt under40seconds; Pause clears it.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### F-10: Clearing profile bio/name can report success without clearing persisted data

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Frontend converts empty bio/displayName/avatar to undefined, omitting them from JSON. Backend explicitly supports empty Bio only when dto.Bio is not null; displayName and avatar updates reject empty values. Profile page updates local user and navigates as success.

**Planned correction:**

Use explicit field-presence semantics and send empty string/null to clear; let server validate and apply supported clears.

**Implemented correction or mitigation:**

Frontend: Explicit empty bio/displayName values reach User API. AvatarURL is no longer included in general profile PUT; validated upload endpoint owns avatar mutations.

**Changed files:**

- Frontend/src/app/user/edit/page.tsx
- Frontend/src/lib/api.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Live set profile fields, clear through UI, save, complete reload: both remain empty. Original synthetic profile restored afterwards.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### F-11: Search responses can overwrite newer queries and blank search leaves results

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

There is debounce but no request sequencing/abort. Every response setsResults regardless of current query. Effect skips performSearch on blank input, so clearing never invokes its empty-query cleanup. URL query triggers both immediate and debounced request.

**Planned correction:**

Abort old request or gate result by monotonically increasing request ID; handle blank query immediately and dedupe initial URL search.

**Implemented correction or mitigation:**

Frontend: AbortController and request sequence prevent stale query writes. Blank query clears results/loading immediately; initial URL query is read once.

**Changed files:**

- Frontend/src/app/search/page.tsx
- Frontend/src/lib/api.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Live browser controlled800ms old query cannot replace later results; clearing removes results and searching state.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### F-12: Outages are shown as empty data and empty feeds retry indefinitely

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Runtime: poisoned isolated Music catalogue returned500 but dashboard said 'No music content available yet' instead of error. Helpers catch errors and return[]/null/empty notification response; callers cannot distinguish outage. Empty feed with successful [] triggers new reset after1second, restores loading then repeats unbounded. Playlist failure has only console feedback.

**Planned correction:**

Preserve request errors with typed states, show partial failure and retry; use bounded/backoff feed retries only on transient failures, treat successful empty results as terminal.

**Implemented correction or mitigation:**

Frontend: Errors propagate through request/client; UI separates loading/error/successful-empty, retains mutation drafts and provides retry. Successful empty feed ends startup retries.

**Changed files:**

- Frontend/src/lib/request.ts
- Frontend/src/lib/api.ts
- Frontend/src/app/feed/page.tsx
- Frontend/src/app/dashboard/page.tsx
- Frontend/src/app/friends/page.tsx
- Frontend/src/app/notifications/page.tsx
- Frontend/src/components/PlaylistManager.tsx
- Frontend/tests/session.test.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Unit503 propagates instead of[]; deferred effect StrictMode probe performs one startup.
- Live controlled503 playlist create shows error and retains form draft.
- Root independent UI outage review identified contradictory empty/error states, now removed.

**Remaining limitations:**

- Broader service-outage checks are in Frontend/docs/local-demo evidence produced by root.

### F-13: Shared forms have no programmatic labels or error associations

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Browser DOM of all four registration inputs had id='', labels.length0, aria-label null and aria-describedby null; login AX fields likewise unnamed. Input renders sibling label without htmlFor and error paragraph without IDs/aria-invalid. Modal divs and several icon buttons also lack dialog/focus/name behavior (reviewed code, broader assistive-tech testing unverified).

**Planned correction:**

Generate stable input IDs, htmlFor, error IDs/aria-describedby/aria-invalid, appropriate autocomplete and accessible names; implement dialog semantics/focus management.

**Implemented correction or mitigation:**

Frontend: Stable label/ID and validation associations; named icon controls; focus-trapped Escape-dismissable dialogs; native keyboard seek/volume range controls. Closed navigation is aria-hidden and inert, and friend-request accept/decline actions have explicit accessible names.

**Changed files:**

- Frontend/src/components/ui/Input.tsx
- Frontend/src/hooks/useDialog.ts
- Frontend/src/components/UpdateModal.tsx
- Frontend/src/components/layout/AppLayout.tsx
- Frontend/src/app/admin/artists/page.tsx
- Frontend/src/app/admin/songs/page.tsx
- Frontend/src/app/playlists/[id]/page.tsx
- Frontend/tests/input.test.tsx
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Input unit verifies label focus and invalid/describedby relationships.
- Actual browser login/recovery/profile/playlist/chat workflows locate controls by accessible name.
- Fresh-image mobile test verifies aria-hidden/inert and a Tab action cannot focus a closed-sidebar descendant; named song actions remain visible and document overflow is zero.

**Remaining limitations:**

- Broader assistive-technology and browser certification is a production follow-up.

### F-14: Declared formatter commands cannot execute

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

npm ci restored locked dependencies; npm run format:check exited1 because prettier is not recognized. Prettier is not declared in devDependencies. No frontend test script or test framework exists.

**Planned correction:**

Declare and pin Prettier, align scripts/CI and add targeted workflow/contract tests for findings.

**Implemented correction or mitigation:**

Frontend: Pinned formatter and compatible ESLint9/Next16 tooling; meaningful unit and live browser suites, validation-onlyCI.

**Changed files:**

- Frontend/package.json
- Frontend/package-lock.json
- Frontend/.prettierrc
- Frontend/eslint.config.mjs
- Frontend/.github/workflows/ci-cd.yml
- Frontend/vitest.config.mts
- Frontend/playwright.config.ts
- Frontend/tests

**Regression tests and verification:**

- Fresh npmci completed; npmrunformat executes installed pinned Prettier.
- Type-check passes; ESLint maxwarnings0 passes; unit29/29 pass.
- After final source edits, type-check, ESLint with zero warnings and format:check pass; the latest unit run passed all 17 cases.

**Remaining limitations:**

- Final clean-image build and complete browser acceptance are recorded by the root demo workflow.

### F-15: Listening-history page cannot reach older items and missing profiles can spin forever

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Routed history always requests50items; pagination/hasMore controls are commented out. Missing-user/catch path setsError but never setsIsLoading(false); only effect when profileUser exists clears loading. Thus invalid IDs fail without terminal loading state.

**Planned correction:**

Implement skip/cursor paging with end marker and cancellation; clear loading in finally for profile lookup and render404/error.

**Implemented correction or mitigation:**

Frontend: Bounded50-item skip paging, ID/time deduplication, cancellation, terminal retention marker and finally loading completion.

**Changed files:**

- Frontend/src/app/user/[id]/listening-history/page.tsx
- Frontend/src/lib/api.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Live105 persisted entries on disposable account reached50→100→105 with105 unique datetime values and oldest marker. Account removed using isolated admin context.
- Live missing GUID profile exits loading and displays error.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-01: Anonymous role assignment grants administrator privileges

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Confirmed anonymous role mutation in original controller

**Original evidence:**

AssignRole has no Authorize attribute; controller has none; application sets no fallback policy. AddToRoleAsync accepts any existing role, including startup-created Admin. Parent isolated DB runtime: anonymous role assign 200 followed by fresh login with Admin role.

**Planned correction:**

Require administrator authorization on role changes, allowlist valid roles and synchronize authoritative roles; add deny-by-default authorization with explicit AllowAnonymous on registration/login.

**Implemented correction or mitigation:**

Identity: Fallback authenticated policy; administrator-only allowlisted roles; authoritative synchronization and immediate target session revocation

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/IdentityServiceExtensions.cs
- Identity/Services/ProfileReconciler.cs

**Regression tests and verification:**

- Anonymous and ordinary users rejected with 401/403; persisted role remains ordinary
- Live synthetic promotion/demotion changes Mongo and JWT roles; old privileged access immediately rejected

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-02: Anonymous Identity update changes another account's email/privacy

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original arbitrary account email/privacy update was unauthenticated

**Original evidence:**

UpdateUser(Guid,Dto) has no authorization and never compares caller to target. It updates Email and IsPrivate and returns success. Parent isolated DB runtime: anonymous Identity email/privacy update 200.

**Planned correction:**

Protect administrator update with Admin role, or route self-service updates through authenticated subject; verify email changes through a confirmation flow.

**Implemented correction or mitigation:**

Identity: Admin-only targeted update and claim-derived self route; synchronized privacy; email changes explicitly require verification and are unavailable in this demo

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/Services/ProfileReconciler.cs

**Regression tests and verification:**

- Anonymous/unrelated updates denied with no account state changes
- Public/private seed privacy follows Identity authority

**Remaining limitations:**

- External email confirmation/change is unavailable; UI must show this restriction

### IU-03: Public User CRUD allows profile impersonation, overwrites and deletion

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

UsersController has zero Authorize declarations, ownership checks or fallback authorization. Anonymous requests can create profiles for arbitrary IdentityUserId, rename/edit any profile, upload another user's avatar, delete any Mongo profile, append another user's history. Parent isolated DB runtime: anonymous profile edit 204, history write 200, profile upload 200 persisted valid PNG in Azurite.

**Planned correction:**

Add authorization plus subject-to-IdentityUserId ownership checks; restrict profile provisioning/deletion to trusted service/admin routes; prevent body-supplied ownership.

**Implemented correction or mitigation:**

User: Removed public creation/reset and restricted profile writes to claim owner; admin deletion delegates the coordinated Identity workflow.

**Changed files:**

- User/Controllers/UsersController.cs
- User/Services/ApiSafety.cs

**Regression tests and verification:**

- Real JWT/Mongo anonymous and foreign write denials assert unchanged persisted profile/history.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-04: Public development reset deletes every friendship

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

DELETE api/friends/reset calls DeleteMany(Filter.Empty); no authorization or environment gate. Parent isolated DB runtime: anonymous global friendship reset 200.

**Planned correction:**

Remove development reset from deployed application; for testing restrict to test-only host and isolated dataset.

**Implemented correction or mitigation:**

User: Removed the destructive development friendship reset route.

**Changed files:**

- User/Controllers/FriendsController.cs

**Regression tests and verification:**

- Committed real middleware test calls former reset route and verifies seeded friendship survives.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-05: Friends, follows and notifications trust client-supplied identity

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Accept/decline/remove uses dto.UserId rather than JWT subject. Follow/unfollow uses FollowerId in body. Notification read/update/delete identifies target via path/body/query without authorization. Parent isolated DB runtime: forged follow 200, anonymous target-identity friendship accept 200, anonymous notification read 200.

**Planned correction:**

Require bearer authorization and derive acting user exclusively from claims; filter target ownership by subject, not supplied UserId.

**Implemented correction or mitigation:**

User: All social and notification actors/recipients derive from validated claims; normalized follow edge is authoritative.

**Changed files:**

- User/Controllers/FriendsController.cs
- User/Controllers/FollowsController.cs
- User/Controllers/NotificationsController.cs
- User/Services/SocialCommands.cs

**Regression tests and verification:**

- Concurrent forged follow actor requests keep one actual-actor edge; foreign notification actions denied.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-06: Private profiles' history, playlists and social graphs remain directly readable

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Identity individual account reads exposed another account email/roles; User owns broader privacy boundaries
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

IsPrivate is returned in profile data but never enforced on profile/history/top-artists endpoints; direct synthetic weekly posts compute private history without privacy checks. Any authenticated Identity user can obtain another user's email/roles from GetUser. Parent isolated DB runtime: private profile/history requests anonymously 200.

**Planned correction:**

Centralize visibility policy for self, permitted friends/followers and public data; minimize returned account fields; apply same policy to direct/synthetic posts and reactions.

**Implemented correction or mitigation:**

Identity: Individual Identity details limited to self/Admin; bounded search excludes unrelated private accounts and omits email/roles
User: Central privacy policy covers direct profile/avatar/history, graph and batch/feed reads; unrelated private batch results are minimal summaries.

**Changed files:**

- Identity/Controllers/AuthController.cs
- User/Services/ApiSafety.cs
- User/Controllers/UsersController.cs
- User/Controllers/FollowsController.cs
- User/Controllers/FriendsController.cs
- User/Controllers/FeedController.cs

**Regression tests and verification:**

- Foreign account read returns 403 through actual JWT middleware
- User real Mongo privacy tests cover anonymous/foreign/self/Admin direct and batch reads
- Anonymous/unrelated/self/Admin real Mongo privacy matrix; actual private avatar bytes denial.

**Remaining limitations:**

- Shared finding: full User/Music privacy disposition recorded in their ledgers

### IU-07: Anonymous feed state/reactions can impersonate any account

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

SetNowPlaying accepts IdentityUserId directly, ClearNowPlaying deletes by supplied user ID; SendReaction trusts FromIdentityUserId and FromUserName and toggles that user's stored reactions.

**Planned correction:**

Require authentication, overwrite source identity/name from claims/profile, enforce recipient/post visibility and validate state fields.

**Implemented correction or mitigation:**

User: Feed and reaction actor fields are overwritten from claims; catalogue metadata comes from the canonical Music response.

**Changed files:**

- User/Controllers/FeedController.cs
- User/Services/CanonicalSongReader.cs

**Regression tests and verification:**

- Persisted forged feed/reaction actor regression; canonical/unknown catalogue and no-side-effect tests.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-08: NotificationHub exposes a method allowing any user to forge another user's notifications

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Public SendNotificationToUser is a client-invokable hub method. Hub-level Authorize only requires login; method does not check role/subject and sends arbitrary supplied notification/ActionUrl to notifications_target. Isolated authenticated WebSocket runtime: two NotificationHub clients; ordinary auditdeepviewer invokes SendNotificationToUser for auditdeep; victim receives forged notification title, spoofed source and arbitrary example.invalid ActionUrl.

**Planned correction:**

Move server send helper out of Hub into injected IHubContext service or mark NonHubMethod; only expose appropriate recipient-owned methods.

**Implemented correction or mitigation:**

User: Removed callable server-only notification delivery methods from authenticated hub.

**Changed files:**

- User/Hubs/NotificationHub.cs

**Regression tests and verification:**

- Actual SignalR invocation of removed helper fails and creates no forged notification.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-09: Chat creation/enumeration does not require caller to be a participant

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

CreateOrGetChat verifies a token exists but never compares currentUserId with ParticipantIds. It can return existing third-party private chat IDs/name/participants/lastActivity or create a chat between others. Parent isolated DB runtime: unrelated Mallory chat create-or-get 200 exposes chat ID.

**Planned correction:**

Require authenticated caller in participant set, validate exact/distinct counts, apply initiation/privacy policy and unique direct-chat key.

**Implemented correction or mitigation:**

User: Chat creation requires caller membership and valid distinct profiles; private recipients require accepted friendship; reads/sends/receipts check membership.

**Changed files:**

- User/Services/ChatCommands.cs
- User/Controllers/ChatsController.cs
- User/Hubs/ChatHub.cs

**Regression tests and verification:**

- Real JWT/Mongo third-party chat creation/read/send denials and canonical chat/message state assertions.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-10: Refresh requires an unexpired access token

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original refresh required a live access token

**Original evidence:**

Refresh endpoint has Authorize while JWT middleware ValidateLifetime=true. A valid seven-day refresh token alone cannot reach action after access expiry and grace period. Parent isolated DB runtime: refresh with no bearer 401 despite valid refresh credential.

**Planned correction:**

AllowAnonymous on refresh while authenticating via validated, single-use refresh credential; enforce expiry/revocation/reuse rules.

**Implemented correction or mitigation:**

Identity: AllowAnonymous refresh authenticates solely through the HttpOnly refresh credential and explicit origin/request protections

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/Services/SessionService.cs

**Regression tests and verification:**

- Cookie refresh without bearer succeeds in WAF and live PostgreSQL stack
- Missing/revoked/expired cookie denied

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-11: Logout/password change leave refresh sessions usable and hubs outlive token expiry

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original logout/password changes did not revoke sessions
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Logout only calls cookie SignOutAsync; password change updates password/security stamp but JWT refresh path never checks stamp and does not revoke refresh rows. All hubs CloseOnAuthenticationExpiration=false. Parent isolated DB runtime: refresh after logout 200.

**Planned correction:**

Revoke appropriate refresh-token family on logout and all sessions on password/security changes, bind session/security version to access tokens and hubs, close/reconnect hubs at expiration.

**Implemented correction or mitigation:**

Identity: Stable session families; logout family revocation; password/reset/role changes revoke all target sessions; sid validation on Identity and downstream APIs; hub expiration/invocation enforcement by User
User: Each HTTP request and hub invocation validates durable Identity sid; expired hub authentication closes connections.

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/Services/SessionService.cs
- Identity/Entities/SessionFamily.cs
- Identity/IdentityServiceExtensions.cs
- User/Program.cs
- User/Services/ApiSafety.cs

**Regression tests and verification:**

- Logout rejects prior Identity/User/Music access token immediately
- Password change revokes both simulated devices
- Actual Mailpit reset revokes old refresh family
- Real User hub invocation denied after revoked sid
- Actual signed short-lived access token closes the live User SignalR connection at expiry
- Real JWT expiry/sid rejection and actual hub revocation; full-stack immediate logout/password/role revocation.

**Remaining limitations:**

- Each downstream request validates sid through single local Identity service; dependency failure returns 503

### IU-12: Refresh rotation is non-atomic and permits concurrent reuse

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original read-then-rotate allowed duplicate successors

**Original evidence:**

Both requests can read IsRevoked=false; each creates/saves successor before revoking original. RefreshToken has no concurrency token/conditional update or explicit transaction spanning check/create/revoke. Parent isolated DB runtime: three concurrent same-refresh attempts; first 200/400 then 200/200 twice, confirming race permits double rotation.

**Planned correction:**

Use atomic compare-and-set consume, transaction and row version/lock; track token family/replacement and revoke family on replay; store refresh hashes.

**Implemented correction or mitigation:**

Identity: Hashed credentials; per-family PostgreSQL row lock and conditional consumption in one transaction; strict replay revokes entire family

**Changed files:**

- Identity/Services/SessionService.cs
- Identity/Entities/RefreshToken.cs
- Identity/Entities/SessionFamily.cs
- Identity/Migrations/20261003171736_AtomicSessionFamilies.cs

**Regression tests and verification:**

- Four simultaneous refresh requests against PostgreSQL produce exactly one 200
- Persisted family is revoked by replay; winner successor cannot authenticate or refresh

**Remaining limitations:**

- A legitimate racing tab also triggers strict family revocation; frontend must coordinate refresh across tabs

### IU-13: Registration sync can silently succeed without a profile and retries can duplicate profiles

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original provisioning skipped required Mongo failures and inserted duplicates
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Missing/invalid Mongo configuration causes sync method return without exception, yet Register returns success. Insert sync retries construct a new BSON document without stable _id; no unique IdentityUserId index defined anywhere in Identity/User. Cleanup deletes Identity user only. Isolated API runtime: anonymous profile provisioning twice for one fresh synthetic IdentityUserId creates two distinct Mongo IDs; GET all verifies two documents.

**Planned correction:**

Enforce unique IdentityUserId index, idempotent upsert with stable ID, explicit required-sync status or durable outbox/reconciliation; handle compensations and partial commits.

**Implemented correction or mitigation:**

Identity: Required configuration; reusable non-null Mongo client; unique IdentityUserId index and idempotent upsert; durable PostgreSQL outbox committed with account creation; explicit pending 503
User: Profiles use a unique Identity GUID index shared with Identity and trusted idempotent reconciliation.

**Changed files:**

- Identity/Program.cs
- Identity/Services/UserSyncService.cs
- Identity/Services/ProfileReconciler.cs
- Identity/Entities/ProfileSyncWork.cs
- Identity/Data/IdentityDbContext.cs
- User/Services/IndexInitializer.cs
- User/Controllers/UsersController.cs

**Regression tests and verification:**

- Fault-injected registration retains one account plus durable pending work and returns 503
- Recovery/login produces one profile
- Real missing profile repaired twice retains one canonical Mongo profile
- Live missing-profile recovery and repeated repair leave one canonical profile; repeated seed checks uniqueness.

**Remaining limitations:**

- Single-instance reconciler; no distributed outbox leasing

### IU-14: Profile/privacy/role synchronization acknowledges divergence and role assignment never syncs

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original privacy/role mutations could acknowledge divergence
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Identity update catches Mongo failure and returns success. UpdateUserInMongoDb does not upsert and treats matched 0 as success. Generic AssignRole changes Postgre roles without Mongo sync. User profile edit changes Mongo username/privacy without updating Identity authoritative properties.

**Planned correction:**

Define field ownership; persist versioned outbox events/retry reconciliation, enforce role update syncing, propagate failures/pending status, reconcile missing profile safely.

**Implemented correction or mitigation:**

Identity: Identity field ownership; immutable durable sync work per mutation; account-row serialization prevents stale remote overwrites; profile upsert preserves User-owned fields; typed internal account updates and explicit pending result
User: Identity owns username/privacy/roles; User presentation edits preserve absent fields, allow clear, and fail when authority sync is incomplete.

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/Services/UserSyncService.cs
- Identity/Services/ProfileReconciler.cs
- Identity/docs/LOCAL-CONTRACT.md
- User/Controllers/UsersController.cs

**Regression tests and verification:**

- Live promotion/demotion matches Mongo role and next JWT
- Seed public/private profile edits applied through authority route
- Four concurrent privacy mutations acknowledge completed remote writes and leave Mongo equal to PostgreSQL
- Fault adapter proves pending work survives and retries
- Live authoritative role/privacy concurrency and persisted profile clear/validation checks.

**Remaining limitations:**

- No atomic cross-store transaction; pending results are explicit and retryable

### IU-15: Account deletion leaves related data and can report success after partial deletion

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original account deletion swallowed incomplete Mongo cleanup
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Identity DeleteUser removes Postgre user then best-effort Mongo DeleteOne and swallows failure; sync deletes only users collection. User DeleteUser removes only profile. No cleanup of chats/messages/friendships/follow arrays/feed/reactions/notifications/avatar blobs.

**Planned correction:**

Implement idempotent deletion workflow/outbox with documented retention/anonymization and cleanup of relations/media; revoke sessions and retry failures.

**Implemented correction or mitigation:**

Identity: Disable account and revoke sessions transactionally; persist deletion outbox; retry User relation/avatar/Music playlist cleanup; delete Identity only after service acknowledgement
User: Internal cleanup is idempotent, calls Music owner cleanup, clears GUID relations and bounded chat batches, and deletes profile last.

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/Services/UserSyncService.cs
- Identity/Services/ProfileReconciler.cs
- Identity/Entities/User.cs
- User/Controllers/UsersController.cs
- User/Services/MongoTransactions.cs

**Regression tests and verification:**

- WAF cleanup outage returns 202, disables account and preserves durable retry work
- Live account cleanup with repaired Music internal route removes PostgreSQL account/outbox and Mongo profile
- Earlier old-image Music 404 was exposed as pending, not fake success
- Full-stack deletion asserts PostgreSQL/Mongo cleanup and retains pending outbox on service failure.

**Remaining limitations:**

- Related User/Music cleanup invariants are owned and recorded by those repositories

### IU-16: Missing-user synchronization/recovery cannot authenticate to Identity and has incompatible JSON contracts

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original profile recovery used unauthenticated incompatible account endpoints
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Recovery HttpClient sends no Authorization to [Authorize] individual user/[Admin] list endpoints. Bulk parses List&lt;IdentityUserDto&gt; but Identity returns {users,totalCount}; case-sensitive JsonSerializer default parses lowercase id/username/isPrivate into Pascal properties poorly.

**Planned correction:**

Use authenticated service-to-service contract and configured URLs, typed shared DTOs/JSON options, correct users envelope, explicit idempotent profile provisioning.

**Implemented correction or mitigation:**

Identity: Fresh shared service credential and restricted typed internal user/list contract; correctly bounded envelope and case-insensitive User deserialization
User: Trusted internal service authentication and typed JSON contracts replace incompatible anonymous repair.

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/docs/LOCAL-CONTRACT.md
- User/Controllers/UsersController.cs
- User/Program.cs

**Regression tests and verification:**

- Live deletion of synthetic profile followed by two trusted repairs restores canonical username/privacy/roles once
- Internal account route denied without service secret
- Live missing-profile repair and canonical username/role/privacy checks.

**Remaining limitations:**

- User's shared service client and recovery implementation recorded in User ledger

### IU-17: Mongo fallback factory returns null but immediately resolves it as required, causing activation failures

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Mongo client factory returns null for missing config/connection errors. Context factory calls GetRequiredService&lt;IMongoClient&gt; before its null check; required resolution throws. Singleton failed startup has no reconnect replacement. Ping Wait(10 seconds) return value ignored can mark unavailable server connected.

**Planned correction:**

Always construct reusable MongoClient without synchronous health gating, register a non-null context; use readiness health checks and driver reconnect, return 503 for operations on unavailable dependency.

**Implemented correction or mitigation:**

User: Reusable non-null Mongo client with bounded connection/socket timeouts; no constructor health gate.

**Changed files:**

- User/Program.cs
- User/Data/MongoDbContext.cs

**Regression tests and verification:**

- Mongo outage returns503; recovery retains API containers and reconnects to persisted data.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-18: Production friend hub logs raw access tokens and chat contents

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

FriendHub writes all query parameter values; SignalR WebSockets use access_token query. ChatHub logs full content before checks; NotificationHub dumps all claims; NotificationService logs message preview/content. These are unconditional Information logs.

**Planned correction:**

Remove raw query/body/claims logs or redact credentials and minimize structured metadata; protect retention/access and rotate if existing logs exposed.

**Implemented correction or mitigation:**

User: Removed token/chat-content logs and obsolete insecure hub; request framework logs are Warning.

**Changed files:**

- User/Hubs/FriendHub.cs
- User/Hubs/ChatHub.cs
- User/appsettings.json

**Regression tests and verification:**

- Source/logging review and live hub tests without credential/content output.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-19: Public diagnostics reflect credentials and connection-string prefixes

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Identity connection diagnostic published/logged connection-string prefixes
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

diagnose-signalr echoes every header/cookie/query; Identity test-connection publishes/logs first 50 chars of DB strings and stack traces; not development-gated or authorized. Prefix can include Mongo user/password depending configured format.

**Planned correction:**

Remove public diagnostics or restrict to administrators/development; redact sensitive fields entirely rather than truncate secrets.

**Implemented correction or mitigation:**

Identity: Remove diagnostic route; sanitized structured error type and trace ID; no connection prefixes or stack traces returned
User: Removed public debug/connection-string diagnostics; health emits only readiness state.

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/Program.cs
- User/Controllers/DebugController.cs (removed)
- User/Program.cs

**Regression tests and verification:**

- Authenticated diagnostic request returns 404
- Runtime dependency failures contain only generic failures and operational IDs
- Real health/live/ready responses and unavailable dependency checks; no public debug route.

**Remaining limitations:**

- Historical external log exposure/revocation is not claimed

### IU-20: Chat access-denied branches pass error message as authentication scheme

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

ControllerBase.Forbid(string) treats its parameter as an authentication scheme, not an error message; there is no scheme named 'Access denied to this chat'. Parent isolated DB runtime: unrelated user requesting known chat messages 500 instead 403.

**Planned correction:**

Use Forbid() or StatusCode(403)/problem body; centralize permission response handling.

**Implemented correction or mitigation:**

User: Structured ApiProblem produces403 instead of passing a message as an authentication scheme.

**Changed files:**

- User/Services/ApiSafety.cs
- User/Services/ChatCommands.cs

**Regression tests and verification:**

- Nonmember chat operations return403 with unchanged message count.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-21: Reaction migration points to an ID that was never stored

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

New FeedItem allocates Id locally; UpdateOne(upsert) sets fields without Id and does not read actual upsert/existing ID. Migration then sets reaction.PostId=feedItem.Id, the unused locally generated ID. Isolated DB runtime: seeded synthetic nowplaying reaction count 1; after history append actual feed _id6ac1281be347628a32c760ed but migrated PostId6ac1281bb85fbb64acf402f2; actual feed reaction query returns0.

**Planned correction:**

FindOneAndUpdate with return document, use persisted returned Id; stable key unique index; perform idempotent reaction migration.

**Implemented correction or mitigation:**

User: Reaction migration uses the persisted feed upsert ID and merges duplicate legacy reactions in the same history transaction.

**Changed files:**

- User/Services/HistoryService.cs
- User/Controllers/FeedController.cs

**Regression tests and verification:**

- Persisted now-playing/recent-song reaction migration and stable post-ID checks.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-22: Weekly artists become stale within week and history cap invalidates weekly totals

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Read returns cached week whenever any artist count&gt;1; later history append never invalidates cache. All weekly computations use last 100-history array, so &gt;100 plays lose early-week counts. Sunday job filters PlayedAt &gt;= new week start, computes mostly empty new-week data, not prior week summary. Isolated DB runtime: append ArtistA twice and read→A count 2; append ArtistB three times and read→still A count 2, missing B entirely.

**Planned correction:**

Increment durable per-week aggregates or invalidate/recompute after append; retain appropriate event horizon; clarify whether job snapshots prior week or starts new week and calculate correct window.

**Implemented correction or mitigation:**

User: History is separate indexed events retained90days; weekly aggregates use half-open UTC Sunday windows and current events, including more than100 plays.

**Changed files:**

- User/Services/HistoryService.cs
- User/Controllers/FeedController.cs
- User/Entities/HistoryEvent.cs

**Regression tests and verification:**

- 105 persisted API history events and page tail; controlled week boundaries and batched top-three public feed.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-23: Multiple tabs disconnect incorrectly remove a user's remaining online/active-chat presence

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

FriendHub static unsynchronized Dictionary stores one connection per user; any disconnect removes entire user and announces offline. Chat active store holds user bool, not connections; disconnect removes user from all chats even while another tab views them.

**Planned correction:**

Track a concurrent set of connection IDs per user and chat; remove only departing connection and announce offline after last disconnect; centralize lifetime handling.

**Implemented correction or mitigation:**

User: Presence and active chat count individual connection IDs and remove only the departing tab.

**Changed files:**

- User/Services/PresenceStore.cs
- User/Services/ActiveChatTrackingService.cs
- User/Hubs/FriendHub.cs
- User/Hubs/ChatHub.cs

**Regression tests and verification:**

- Multi-connection presence/active membership regression; actual hub connections and delivery.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-24: REST chat sending and FriendHub sending omit updates/events supplied by ChatHub

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

REST sends only notification helper, skips active chat recipients, and never sends ChatHub ReceiveMessage. FriendHub inserts message but never updates Chat.LastMessageId/LastActivity. Equivalent exposed send APIs produce different state/realtime behavior.

**Planned correction:**

Share a single message-write service updating state consistently, publish ReceiveMessage to participants for every send path, separate notification suppression from message delivery.

**Implemented correction or mitigation:**

User: REST and both hubs share message commands, projection, broadcasts, idempotent notifications and canonical acknowledgements.

**Changed files:**

- User/Services/ChatCommands.cs
- User/Controllers/ChatsController.cs
- User/Hubs/ChatHub.cs
- User/Hubs/FriendHub.cs

**Regression tests and verification:**

- Actual REST plus LongPolling SignalR sends converge on canonical message IDs and receipts.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-25: Social/read-history mutations use read-then-write operations without atomic uniqueness

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Follow checks list then pushes to two users separately, friends/reactions check then insert without unique indexes, history trim replaces stale array, mark-all-read replaces whole messages based on old snapshot. Isolated concurrency runtime: eight asynchronous anonymous follow requests sent for fresh deep→viewer; PowerShell result-gathering failed on ambiguous WhenAll overload; subsequent independent profile queries prove seven duplicate following/follower array edges persisted.

**Planned correction:**

Use addToSet/atomic conditional updates, normalized unique keys/indexes and transactional/outbox relation changes; bounded atomic push+slice for history; append read receipts atomically keyed by user.

**Implemented correction or mitigation:**

User: Unique indexes plus bounded snapshot transactions protect follow/friend/chat/message/feed state; receipts use conditional atomic pushes.

**Changed files:**

- User/Services/IndexInitializer.cs
- User/Services/MongoTransactions.cs
- User/Services/SocialCommands.cs
- User/Services/ChatCommands.cs

**Regression tests and verification:**

- Real concurrent follow/message/receipt assertions and transaction rollback test.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-26: Unbounded scans/pagination and N+1 remote/database lookups

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Identity administrator lists performed unbounded serial role lookups
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Feed loads every public user with listening history before shuffling/skip; weekly job loads all users. Notifications/chat limit unvalidated (Mongo limit 0 means no limit); messages fetch sender per message; history opens HttpClient per request and many concurrent localhost:5001 calls. No User index creation shown.

**Planned correction:**

Bound all pagination/batches, indexes on ownership/activity keys, query/project/paginate server-side, bulk sender lookups, HttpClientFactory and configurable Music URL.

**Implemented correction or mitigation:**

Identity: Bounded pagination and bulk role join; literal bounded search; cancellable EF operations
User: Bounded pagination, batch participant/last-message lookups, graph-free list DTOs and indexed author-batch feed aggregates replace unlimited scans and serial N+1 queries.

**Changed files:**

- Identity/Controllers/AuthController.cs
- User/Services/IndexInitializer.cs
- User/Controllers/FeedController.cs
- User/Controllers/UsersController.cs
- User/Services/HistoryService.cs
- User/Services/ChatCommands.cs
- User/Controllers/ChatsController.cs

**Regression tests and verification:**

- Invalid zero page size returns 400
- Live admin workflows and test role lists use canonical bounded envelopes
- Invalid page limits rejected; history page tail and batched public-author top-three correctness.

**Remaining limitations:**

- Shared User performance work recorded separately; no production-scale load claim
- Production-scale load testing remains a follow-up.

### IU-27: Avatar uploads trust declared MIME/filename, omit content metadata and never clean replaced blobs

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Validation only checks supplied ContentType and 5 MB; extension from filename, no file-signature/decoding check; BlobClient.UploadAsync sets no image ContentType. Each upload new GUID, previous avatar never deleted; one-year SAS persisted, no refresh process.

**Planned correction:**

Decode/reencode allowlisted image, restrict extensions, set explicit content headers, cleanup old/orphan files with durable workflow, use stable mediated delivery or SAS refresh.

**Implemented correction or mitigation:**

User: Decode actual bytes with MIT Skia, reject incomplete/oversized images, normalize PNG, upload before CAS metadata publication, and persist cleanup intents.

**Changed files:**

- User/Services/AzureBlobService.cs
- User/Services/AvatarMaintenance.cs
- User/Controllers/UsersController.cs

**Regression tests and verification:**

- Real Azurite avatar upload/MIME/privacy, spoof/truncation/size/dimension denials, replacement and two-upload CAS cleanup.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-28: Persisted and realtime notifications have inconsistent IDs/types and terminal state

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

CreateNotificationAsync returns no created notification ID. Realtime NewNotification objects omit ID/status and FriendAdded persists enum Other but emits Type='FriendAdded'. Friend accept/decline does not mark original persistent request handled. REST list/count includes expired notifications whereas service/hub excludes them. Isolated DB runtime: original request notification unread status 0 before and after successful accept; new FriendAdded persisted Type 5 (Other); unread count 2.

**Planned correction:**

Return/share canonical notification DTO+ID, update original request status idempotently, use same type schema/expiry filter everywhere.

**Implemented correction or mitigation:**

User: Notifications publish persisted IDs and string types/status; owner mutations preserve Handled, expiry counts agree, and transactional commands use idempotent keys.

**Changed files:**

- User/Services/NotificationService.cs
- User/Hubs/NotificationHub.cs
- User/Services/SocialCommands.cs

**Regression tests and verification:**

- Persisted terminal friend request, notification owner and actual hub canonical ID regressions.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-29: JWT diagnostic labels any parsable token valid without validation

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

test-jwt calls ReadJwtToken only then responds isValid=true; no signature/issuer/audience/lifetime validation.

**Planned correction:**

Remove production route or perform same TokenValidationParameters as real middleware and describe parsing accurately.

**Implemented correction or mitigation:**

User: Removed token parser diagnostics; only validated signed JWT authentication establishes identity.

**Changed files:**

- User/Services/ApiSafety.cs
- User/Program.cs

**Regression tests and verification:**

- Actual bad signature/issuer/audience/expired/missing-sid rejection, persisted state unchanged.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### M-01: Normal catalogue PUT writes an unknown field that makes the document unreadable

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

All three update builders start with Set(placeholder, placeholder), preserving that field in the resulting update. No BsonIgnoreExtraElements convention or attributes exist. Actual BSON update render contains $set.placeholder. Actual deserialization of each model with that field throws FormatException: Element 'placeholder' does not match any field or property.

**Planned correction:**

Build a list of real update definitions and Combine them; reject/no-op empty updates. Remove already-written placeholder fields through a controlled migration. Add serializer and route regression coverage.

**Implemented correction or mitigation:**

Music: Shared command implementations contain no synthetic update fields. Startup and the restricted repair route remove only the historical placeholder field.

**Changed files:**

- Music/Controllers/ArtistsController.cs
- Music/Controllers/AlbumsController.cs
- Music/Controllers/SongsController.cs
- Music/Services/CatalogueService.cs
- Music/Services/MediaCommands.cs

**Regression tests and verification:**

- CatalogueCommandsAuthorizePersistRenameRelationshipsRepairAndDeleteThroughEveryRoute
- PUT all three entities then read/search and inspect raw BSON; deliberately insert placeholder into three test collections, repair3, subsequent GET succeeds.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-02: Anonymous media proxy exposes arbitrary private blobs in the configured account

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Image/audio endpoints lack authorization and derive container/blob only from URI.AbsolutePath. They ignore the supplied host, scheme and SAS query and download with the service account credential. Controller probe using https://attacker.invalid/private-data/confidential.json returned FileContentResult with private mock blob bytes without authentication/SAS. Root isolated Azurite fixture: a private users-container avatar (70bytes) was returned by Music with an arbitrary attacker.invalid URL host and no SAS.

**Planned correction:**

Resolve media by permitted catalogue IDs and explicit authorization, or strictly allow configured media containers/account hosts/prefixes. Authenticate protected content and apply intended lifetime rules; use scoped storage credentials.

**Implemented correction or mitigation:**

Music: Proxy accepts configured account identities/allowed containers and requires a current permitted catalogue reference; private playlist covers enforce visibility.

**Changed files:**

- Music/Services/AzureBlobService.cs
- Music/Services/MediaCommands.cs
- Music/Controllers/MediaController.cs

**Regression tests and verification:**

- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Foreign-host/private-container attempt400; valid catalogue bytes and PNG MIME verified. No whole-container public access changes.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-03: Public search allows regex failures and unbounded expensive matching

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Each user word is constructed as new Regex(word, IgnoreCase) without escaping or timeout; actual Regex('[') throws RegexParseException and default MatchTimeout is infinite. Three collections are fully materialized before Take(20). Admin search also embeds raw server regex at AdminController713 but requires Admin.

**Planned correction:**

Treat input as literal, limit query length/word count and add finite timeout if regex remains. Move filtered, indexed, projected and limited search into Mongo (or dedicated search), propagate cancellation and add request rate limits.

**Implemented correction or mitigation:**

Music: Literal escaped bounded Mongo search, database limits/MaxTime, cancellation, and60/minute/IP rate limit.

**Changed files:**

- Music/Services/CatalogueService.cs
- Music/Controllers/SearchController.cs
- Music/Program.cs

**Regression tests and verification:**

- CatalogueCommandsAuthorizePersistRenameRelationshipsRepairAndDeleteThroughEveryRoute
- Search '[' succeeds as a literal empty result; renamed artist still locates song by immutable ID. Query result limits and request rate limiter wired in production.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-04: Playlist and album ordering is not persisted consistently and duplicate adds race

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Existing positions are incremented only on the loaded object; actual update is only $push plus UpdatedAt. Probe inserting at0 into [0,1] returned OkResult but stored [0,1,0]. Removal does not reindex and appending uses count. Existence checks and pushes are separate, and no atomic duplicate predicate/version condition exists. Isolated real Mongo/HTTP: insertion persisted positions[0,0,1]; two concurrent same-song POSTs both returned200 and resulting playlist contained2references to1distinct song.

**Planned correction:**

Perform ordering and uniqueness updates atomically, with document version/compare-and-swap or transaction/aggregation update. Validate position bounds, reindex removals, and use an atomic no-existing-song predicate.

**Implemented correction or mitigation:**

Music: Versioned playlist replacement preserves unique contiguous positions; shared command gate and Mongo transactions protect album ordering/relationships.

**Changed files:**

- Music/Services/PlaylistService.cs
- Music/Services/CatalogueService.cs
- Music/Models/Playlist.cs
- Music/Models/Song.cs

**Regression tests and verification:**

- PlaylistsPersistContiguousOrderAtomicUniquenessPrivacyAndOwnerPermissions
- Six simultaneous same-song adds persist exactly one reference and return one200/five409; reorder/removal persisted IDs/positions asserted; song deletion reindexes transactionally.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-05: Duplicate CRUD routes apply incompatible relationship and deletion rules

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Basic catalogue delete endpoints only DeleteOne. Admin equivalents add referential guards and blob cleanup, but Admin song deletion still does not remove playlist references. Basic AddSongToAlbum pushes to album.Songs without updating song.Album. Basic create/update accept embedded relationship references without validation/inverse updates. Isolated HTTP add-song-to-album200 left song.Album null. Admin delete artist400 was immediately bypassed with basic delete204; album GET200 retained reference to the deleted artist.

**Planned correction:**

Centralize catalogue commands in shared services enforcing one relationship/deletion policy; validate referenced IDs, maintain both directions or choose one canonical relationship representation. Remove playlist references and coordinate storage cleanup through retryable jobs.

**Implemented correction or mitigation:**

Music: All basic/admin routes call the same services. Album.Artist/Song.Album/Artists IDs canonical; presentation inverse relationships derived; guarded artist/album delete and transactional song/playlist cleanup.

**Changed files:**

- Music/Controllers/AdminController.cs
- Music/Controllers/ArtistsController.cs
- Music/Controllers/AlbumsController.cs
- Music/Controllers/SongsController.cs
- Music/Services/CatalogueService.cs

**Regression tests and verification:**

- CatalogueCommandsAuthorizePersistRenameRelationshipsRepairAndDeleteThroughEveryRoute
- PlaylistsPersistContiguousOrderAtomicUniquenessPrivacyAndOwnerPermissions
- Both deletion route families409 while referenced; song deletion removes canonical album song and every playlist reference. Basic JSON mutations cannot bypass file/reference validation.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-06: Media replacement deletes the working file before the replacement succeeds

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Admin artist/song/album updates and playlist cover replacement delete all old prefix files before uploading. Failed audio/artist/album upload returns500 after deletion; failed song cover/snippet upload is swallowed and replacement persists the old now-deleted URL. Album associations can be mutated before later audio upload failure. No compensation/transaction surrounds multi-document writes or uploads.

**Planned correction:**

Upload replacement first, atomically publish metadata after success, then delete specific prior blob with retryable cleanup. Use Mongo transactions or idempotent saga/outbox for related documents, check write results and compensate uploads when metadata persistence fails.

**Implemented correction or mitigation:**

Music: Durable cleanup intent before upload, upload every replacement before publishing metadata, then exact old-object cleanup only if unreferenced.

**Changed files:**

- Music/Services/MediaCommands.cs
- Music/Services/CatalogueService.cs
- Music/Services/PlaylistService.cs

**Regression tests and verification:**

- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Actual unavailable storage host503 preserves prior document and byte hash. Valid new audio followed by invalid new cover400 preserves prior audio and title; cleanup retains referenced old media.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-07: Audio range parsing mishandles valid byte-zero and suffix ranges

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

10-byte mock blob: bytes=0-0 yielded206 Content-Range bytes0-9/10; bytes=-3 yielded206 bytes0-3/10; bytes=garbage-1 accepted as0-1; bytes=20-30 returned NotFoundObjectResult (HTTP404 on MVC execution) rather than416. Actual46byte synthetic WAV: bytes=0-0 returned206all46bytes (range0-45/46); suffix -3 returned first4bytes (0-3/46); garbage-1 returned0-1. Out-of-bounds range caused aborted connection; container log: Response Content-Length mismatch: too few bytes written (15 of46), because action set original blob Content-Length before returning its NotFound body.

**Planned correction:**

Use a standards-tested Range parser/framework processing with known stream length; validate parse success, open-ended/suffix ranges, bounds and416 Content-Range bytes*/length. Add byte-accurate tests.

**Implemented correction or mitigation:**

Music: Strict single-byte-range parser and Azure ranged streaming with exact length/range headers, suffix/open-ended support,416.

**Changed files:**

- Music/Controllers/MediaController.cs

**Regression tests and verification:**

- ExactByteRanges
- InvalidRangesAreRejected
- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- HTTP0-0 onebyte, suffix3 finalbytes, open-ended and selectedrange byte comparisons; unsatisfiable416 bytes */length asserted.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-08: 32-bit randomized URL hashes allow cache collisions and replica inconsistency

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Redis key and ETag use url.GetHashCode(). Probe found two distinct image URLs with the same hash among at most500000 candidates, seeded the first URL's cache, and the second received WRONG-IMAGE without a blob read. String hash is process randomized and ETag depends on URL rather than blob content/version.

**Planned correction:**

Use a canonical account/container/blob identity plus stable cryptographic hash or safely encoded complete key; derive ETag from Azure blob ETag/content version. Namespace caches by environment/account.

**Implemented correction or mitigation:**

Music: Removed both cache tiers and URL hash keys. Uses native Blob ETag/content identity and HTTP mandatory revalidation.

**Changed files:**

- Music/Controllers/MediaController.cs
- Music/Program.cs
- Music/Music.csproj

**Regression tests and verification:**

- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Full/ranged exact bytes independent of URL hash; no GetHashCode keys/ETags or cache collision code remains.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-09: Redis fallback cannot handle Redis unavailable before controller construction

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

MediaController always injects IDatabase, which resolves synchronous ConnectionMultiplexer.Connect before the action runs. Fallback catches only StringGet exceptions after injection. A Redis connection string with default abortConnect behavior causes cold connection failure instead of entering blob fallback; even audio and test routes require Redis resolution. An additional Music container using Redis127.0.0.1:1 (closed) returned /health200, /api/media/test500, /image500 and /audio500. It was removed immediately; the main Redis/Music stack remained running.

**Planned correction:**

Configure resilient asynchronous multiplexer initialization/reconnection or inject optional cache abstraction and fail open to blob. Keep audio independent of Redis. Test cold start and recovered Redis outage.

**Implemented correction or mitigation:**

Music: Redis no longer participates in Music dependency injection or media delivery. Blob streams remain available with cold Redis.

**Changed files:**

- Music/Program.cs
- Music/Controllers/MediaController.cs
- Music/Music.csproj

**Regression tests and verification:**

- RealMiddlewareBootsDuringColdMongoAndReturnsBounded503
- external demo outage integration
- Root outage script stopped Redis and restarted Music; full media SHA and0-0/suffix/open/416 checks passed. Redis not a required Music dependency.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-10: Cache administration does not invalidate memory and may reject connection strings

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

ClearCache only iterates Redis keys; active process IMemoryCache keys remain for sliding30/60minutes and other replicas remain unaffected. GetCacheStatus reports keys.Take(20).Count as TotalImageKeys (max20). Both use GetServer(redisConnectionString) instead of multiplexer.GetEndPoints, potentially invalid with password/SSL/options. Isolated actual cover read cached67PNGbytes, song/blob deletion204 and cache/clear200 were followed by anonymous old cover200 returning the identical67bytes. Real StackExchange.Redis GetServer("127.0.0.1:1,password=synthetic") threw ArgumentException: specified host and port could not be parsed (hostAndPort).

**Planned correction:**

Invalidate both cache tiers across instances using versioned keys or published invalidation; resolve actual endpoints from multiplexer; report accurate or explicitly sampled counts and consider browser cache lifetime.

**Implemented correction or mitigation:**

Music: Cache status/clear administrator-only report disabled accurately. Metadata-reference checks deny deleted media immediately; no memory/Redis tier to retain stale bytes.

**Changed files:**

- Music/Controllers/MediaController.cs
- Music/Services/MediaCommands.cs

**Regression tests and verification:**

- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Read valid cover, deletecover, formerURL404 immediately before physical cleanup. Current referenced audio survives cleanup.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-11: Public playlist listing is unbounded and performs serial per-song database queries

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Anonymous list loads every playlist and separately awaits each song lookup, returns complete songs and SAS URLs. User-specific list has no limit either. Catalogue limits only clamp &gt;100; zero passes through to Mongo's unlimited query semantics and negative/negative skip inputs are not validated. No Music rate limits or request cancellation are configured. Isolated repaired catalogue read limit=1 returned1row; limit=0 returned7rows, demonstrating zero does not enforce a positive page limit.

**Planned correction:**

Validate1..100 limits/nonnegative skip or cursor paging, add deterministic sort; return summary playlists and fetch a bounded detail page. Batch distinct song IDs with one $in or aggregation lookup, project fields and enforce reasonable playlist lengths.

**Implemented correction or mitigation:**

Music: Validated positive1..100 paging, deterministic sort, max skip10000; playlists summaries first20 songs plus full songCount, detail at most500; batched song hydration.

**Changed files:**

- Music/Services/PlaylistService.cs
- Music/Services/CatalogueService.cs
- Music/Services/DemoRules.cs

**Regression tests and verification:**

- CatalogueCommandsAuthorizePersistRenameRelationshipsRepairAndDeleteThroughEveryRoute
- PlaylistsPersistContiguousOrderAtomicUniquenessPrivacyAndOwnerPermissions
- limit0/negative/101/skipnegative400; pagination lives in wired controllers. All page playlist songs resolved in one bounded $in query.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-12: Active catalogue DTOs accept invalid metadata and route IDs become500

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Production DTOs have no Required/MaxLength/Range/URL validation; dead Entities annotations are unused. Mongo model string IDs carry BsonRepresentation(ObjectId); actual rendered Id filter for not-an-object-id throws FormatException. Some detail routes do not catch it; Admin maps to generic500. Basic create may accept empty title, negative duration, fabricated refs/custom media URLs. Actual isolated basic song POST returned201 for empty title,durationSec=-5,invented artist reference and javascript:example FileUrl. Root malformed song ID GET returned500.

**Planned correction:**

Validate active DTOs and ObjectId.TryParse route inputs; bound strings/durations/positions/URLs and verify entity references in shared commands. Return consistent400/404/409 ProblemDetails.

**Implemented correction or mitigation:**

Music: Validation applies inside wired services to route ObjectIds, required bounded text, duration1..7200, real references, media identities and positions.

**Changed files:**

- Music/Controllers/Contracts.cs
- Music/Services/DemoRules.cs
- Music/Services/CatalogueService.cs
- Music/Services/PlaylistService.cs

**Regression tests and verification:**

- CatalogueCommandsAuthorizePersistRenameRelationshipsRepairAndDeleteThroughEveryRoute
- Malformed ID400; invalid title/duration/foreignmedia/fabricatedartist400, persisted valid state remains readable. Ordinary admin writes403 and anonymous401.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-13: Artist rename and name-based joins disconnect valid albums

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

GetArtistAlbums filters album.Artist.Name == current artist.Name rather than ID. Renaming artist changes only its own row; album/song embedded references retain old names. Songs query falls back to name and can mix distinct same-name artists. Album title rename does not update song.Album.Title or artist.Albums titles. Real HTTP album read before artist rename returned1, Admin artist rename200, then albums read returned0 although album.Artist.Id was unchanged.

**Planned correction:**

Join by canonical immutable IDs; resolve presentation metadata centrally or update denormalized references consistently and transactionally. Avoid name matching as identity fallback.

**Implemented correction or mitigation:**

Music: Stable IDs for relationships and ID-based discovery, batched presentation hydration after renames.

**Changed files:**

- Music/Services/CatalogueService.cs

**Regression tests and verification:**

- CatalogueCommandsAuthorizePersistRenameRelationshipsRepairAndDeleteThroughEveryRoute
- Artist and album renames retain album lookup and refreshed song artist/album names; literal artist-name search finds canonical song.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-14: Persisted SAS URLs eventually expire without a renewal mechanism

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Every uploaded media URL contains a SAS expiring365days from upload and is stored as permanent FileUrl/CoverUrl/SnippetUrl/ImageUrl. Reads return the stored string and no refresh/re-sign path exists. The proxy bypasses SAS (M-02), but clients directly using stored URLs expire.

**Planned correction:**

Persist blob identity rather than signed URL and issue short-lived SAS at authorized read time or serve stable application/CDN IDs with intentional access policy. Monitor expiry and test old item access.

**Implemented correction or mitigation:**

Music: Stable application media URLs are persisted without expiring credentials. Read-time metadata visibility is authoritative. Permitted legacy account URLs normalize idempotently.

**Changed files:**

- Music/Services/AzureBlobService.cs
- Music/Services/MediaCommands.cs
- Music/Controllers/MediaController.cs

**Regression tests and verification:**

- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Persisted/upload response URL has no query/SAS and no internal azurite hostname; valid media uses stable identity with immediate deletion/visibility enforcement.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-15: Missing Azure configuration reports successful playlist cover upload without storing the file

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Missing connection string returns placeholder.dev URL and delete returns true, without checking environment. Actual probe returns fake URL from upload. Controller persists it and returns success. Most other Azure operations dereference nullable client and fail.

**Planned correction:**

Validate dependency configuration at startup/readiness; return503 for unavailable storage. Only allow explicit test substitutes through separate environment/DI configuration.

**Implemented correction or mitigation:**

Music: Storage configuration eagerly validated; missing configuration fails clearly and runtime storage failure503 cannot publish fabricated metadata.

**Changed files:**

- Music/Services/AzureBlobService.cs
- Music/Program.cs

**Regression tests and verification:**

- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Real inaccessible Blob endpoint503 and unchanged previous metadata/bytes; placeholder/fake-success code removed.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-16: Blank checked-in container settings defeat advertised defaults

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Checked-in SongsContainer/ArtistsContainer/AlbumsContainer/PlaylistsContainer values are empty strings. Null-coalescing defaults only handle null, so configured empty strings remain invalid names; actual service field inspection confirmed empty SongsContainer survives.

**Planned correction:**

Use defaults for null/whitespace or remove blank settings; validate names and account connection once with options validation. Add a boot configuration smoke test.

**Implemented correction or mitigation:**

Music: Blank container values resolve documented defaults; invalid container names reject configuration.

**Changed files:**

- Music/Services/AzureBlobService.cs
- Music/appsettings.json

**Regression tests and verification:**

- Release build and persisted HTTP upload boot
- Test host custom generated valid containers upload/read; deployed defaults songs/artists/albums/playlists work through root seed. Configuration validated without network gating.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-17: Wildcard response middleware defeats configured cross-origin allowlist

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

After UseCors(policy with configured allowed origins), custom middleware sets Access-Control-Allow-Origin=* on actual responses regardless of requesting origin and handles OPTIONS. ASP.NET Core may separately overwrite allowed-origin headers on response starting; disallowed actual requests still acquire wildcard via custom middleware. Media actions also set wildcard. Real /health GET with unapproved Origin returned200 Access-Control-Allow-Origin:*. A real OPTIONS preflight from that origin returned204 without Access-Control-Allow-Origin, so preflight rejection remains effective.

**Planned correction:**

Remove manual CORS headers/OPTIONS middleware and configure one explicit CORS policy, including allowed/exposed range headers. Test allowed/disallowed actual and preflight requests.

**Implemented correction or mitigation:**

Music: Single exact CORS policy and exposed range/ETag headers; manual wildcard middleware removed.

**Changed files:**

- Music/Program.cs
- Music/Controllers/MediaController.cs

**Regression tests and verification:**

- CorsHasExactAllowlistOnActualAndPreflightRequests
- Allowed actual and preflight responses use exact127.0.0.1 frontend origin and credentials:true; unapproved actual and preflight have neither header.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-18: Mongo outage handling can discard the client and synchronously pings each request

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Singleton IMongoClient factory returns null on missing/failed connection. GetRequiredService&lt;IMongoClient&gt; throws on a null-returning factory before intended new MongoDbContext(null) fallback; actual DI probe reproduced InvalidOperationException. Scoped context synchronously waits for ping on every request, ignores false timeout result and marks connected. Client singleton health is fixed after initial factory result; null cannot reconnect. Actual Microsoft DI null singleton factory was invoked once across2GetRequiredService resolutions, confirming null result is cached.

**Planned correction:**

Always register a valid reusable MongoClient and let driver reconnect; perform cancellable asynchronous health/readiness checks outside request constructor. Avoid nullable service factory/GetRequiredService mismatch and synchronous waits; map dependency failures to503 consistently.

**Implemented correction or mitigation:**

Music: Reusable nonnull Mongo client and context without constructor pings, bounded driver timeouts and dependency failures503; clients reconnect.

**Changed files:**

- Music/Data/MongoDbContext.cs
- Music/Program.cs

**Regression tests and verification:**

- RealMiddlewareBootsDuringColdMongoAndReturnsBounded503
- Real HTTP host boots with unavailableMongo; /api/songs503 under10seconds, live200,ready503; original null-factory/synchronousping paths gone.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-19: Health can report healthy while dependent routes fail and some diagnostics disclose details

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

/health always returns healthy, with no dependency readiness. /health/mongodb exposes ex.Message in production and can fail during DI outside its try. Songs list/search/upload error responses also include raw exception messages. Albums GetAlbumSongs lacks null/disconnected guard; actual invocation with null Mongo context threw ArgumentNullException. Extra cold Redis API instance actually returned /health200 while media routes returned500.

**Planned correction:**

Separate liveness/readiness and include dependency checks with bounded timeouts. Log internal exception details server-side; return sanitized ProblemDetails503. Guard/handle album songs and other unprotected dependency calls.

**Implemented correction or mitigation:**

Music: Separated lightweight live and dependency-aware ready including completed index/migration initialization; sanitized errors, diagnostics removed.

**Changed files:**

- Music/Program.cs
- Music/Services/MediaCommands.cs

**Regression tests and verification:**

- RealMiddlewareBootsDuringColdMongoAndReturnsBounded503
- Dependency failure responses omit endpoint details; live200 and ready503 verified during cold Mongo. Root actual Azurite stop ready503/live200.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-20: Passing unit tests exercise a separate helper and do not cover production failure paths

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Three tests call PlaylistAccessPolicy.CanManage, but production controller has its own private CanManage and never imports/calls the helper. Other tests manually instantiate null MongoContext or prebuilt Redis mock; production DI/auth middleware is absent.8Facts total. Music.sln includes only Music project, so generic solution test commands omit actual tests.

**Planned correction:**

Use one policy implementation in real routes and test HTTP authentication/authorization, dependency boot/outages, serialization updates, ordering/concurrency, multipart uploads/deletion and byte ranges against disposable dependencies. Include tests in solution or explicit CI test command.

**Implemented correction or mitigation:**

Music: Tests exercise real JWT/auth/session/CORS middleware with actual persisted Mongo/Blob state. Production PlaylistService uses PlaylistAccessPolicy. Tests included Music.sln and validation-onlyCI.

**Changed files:**

- Music/tests/Music.Tests/DemoFactory.cs
- Music/tests/Music.Tests/PersistedHttpTests.cs
- Music/tests/Music.Tests/DependencyFailureTests.cs
- Music/Music.sln
- Music/.github/workflows/ci-cd.yml

**Regression tests and verification:**

- All20 Music tests
- Final Release suite20passed/0failed/0skipped, including persisted authorization/ordering/media/bulk invariants; solutionbuild0warnings0errors.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-21: Playlist uploads log a bearer SAS URL

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

UploadPlaylistCover writes Generated cover URL: coverUrl to console. Upload helper supplies read SAS URL valid365days. Unlike Azure helper's path-only success logging, this statement includes the signature/query token.

**Planned correction:**

Log blob identity/operation correlation rather than full signed URL; redact SAS/token queries through logging policy and reduce SAS lifetime.

**Implemented correction or mitigation:**

Music: No SAS URLs generated or logged; only stable blob identities/native ETags. Sanitized logging emits exception type, no request body/token/signed URL.

**Changed files:**

- Music/Services/AzureBlobService.cs
- Music/Controllers/PlaylistsController.cs
- Music/Program.cs

**Regression tests and verification:**

- Source logging scan and stable media URL regression
- All old signed-URL console statements removed. HTTP response metadata URLs contain no SAS query; tests/results omit credentials.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### M-22: Bulk song upload silently ignores count mismatches and undercounts errors

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Loop stops at min(SongsData.Count,AudioFiles.Count) without validating equality/reporting skipped songs/files. Audio upload catch adds Errors then continue without ErrorCount++. CreatedSongs.Add happens before album update, so album-write failure increments ErrorCount while created row remains in CreatedSongs. Bulk accepts blank titles/nonpositive duration unlike single Admin create.

**Planned correction:**

Validate matching counts and each item, report per-item status with stable idempotency key, increment all failures consistently, and coordinate song/album persistence transactionally with storage compensation.

**Implemented correction or mitigation:**

Music: Validate all metadata/file counts up front; complete indexed per-item outcomes and errors; durable fingerprint/idempotency keys and deterministic IDs prevent retry duplicates; canonical album association written in same transaction.

**Changed files:**

- Music/Controllers/AdminController.cs
- Music/Controllers/Contracts.cs
- Music/Services/CatalogueService.cs

**Regression tests and verification:**

- BulkRejectsMismatchesAndReportsEveryFailedRowWithoutPartialMetadata
- Count mismatch400; onevalid/oneinvalid yields exactly1success/1error/2items and one persistedrow. Samekeyretry keeps same ID/one row; changedpayloadkey409.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### O-01: The pinned Next.js App Router release is vulnerable to unauthenticated remote code execution

**Status:** Fixed and verified

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.
Frontend: Shared local-demo operations scope.

**Original evidence:**

Manifest and lockfile resolve Next15.3.4 and React19.1.0. This is an App Router application served through next start/standalone Node. The official Next advisory identifies Next15 App Router as affected by CVE-2025-66478 (upstream CVE-2025-55182, CVSS10.0). npm audit --omit=dev reports Next as critical. Subsequent official advisories also identify RSC denial of service; stopping at the original15.3.6 fix does not address later advisories.

**Planned correction:**

Upgrade Next and matching React/ReactDOM/ESLint packages to a currently supported release containing all applicable security patches, regenerate lockfile, test and redeploy. If this affected build was publicly exposed, review incidents and rotate deployment secrets according to the vendor guidance.

**Implemented correction or mitigation:**

Frontend: Upgrade Next16.3.8 and React/DOM19.3.0 with matchingNext ESLint and supported Node24.
Frontend: Patched Next/React to maintained audited versions; production build and dependency checks replace the vulnerable release.

**Changed files:**

- Frontend/package.json
- Frontend/package-lock.json
- Frontend/Dockerfile
- Frontend/.github/workflows/ci-cd.yml

**Regression tests and verification:**

- Authoritative September2026 Next patch advisory and React release reviewed.
- Fresh lockfile install passes; current runtime npm audit reports0 advisories.
- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

- Final image SBOM and final build are in parent final verification.

### O-02: Dependency scans report vulnerable packages and the frontend image uses an unsupported Node runtime

**Status:** Mitigated for the local demo

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Identity: Original Identity dependencies were older compatible patches
Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.
Frontend: Shared local-demo operations scope.

**Original evidence:**

Frontend runtime image is node:18-alpine; official Node release schedule marks18 EOL. Lockfile glob11.0.3 requires Node20 or&gt;=22, so Docker runtime also violates that declared engine. Production npm scan reports8 vulnerable packages,1critical and7high (Next plus glob,minimatch,@isaacs/brace-expansion,nanoid,postcss,sharp,ws). Identity transitive scan identifies Extensions.Caching.Memory8.0.0, System.Text.Json8.0.0, Snappier1.0.0, SharpCompress0.30.1. User identifies MessagePack2.5.108, Snappier1.0.0 and SharpCompress0.30.1. Music scan reported no known vulnerable packages. Representative official advisories/release notes were verified for each of the eight npm package versions and the cited NuGet advisories; additional scanner entries were not all independently checked. Loaded assembly/runtime and usage conditions must be checked before claiming each exploit is reachable.

**Planned correction:**

Move to a supported LTS Node version, update direct packages that bring vulnerable transitives, remove unused dependencies, produce SBOMs, and use a CI gate that explicitly fails on actionable advisories. Review effective deployed .NET assembly versions and vendor conditions.

**Implemented correction or mitigation:**

Identity: Official NuGet latest compatible .NET8 patches 8.0.31, Npgsql EF8 8.0.11, Mongo 3.12.0; remove unused packages; dependency lockfile; current runtime image
Frontend: Use supported Node24, updated transitive graph, runtime advisory gate and a strict expiring exception for the single unpatched static-lint braces advisory.
Frontend: Patched API/runtime/frontend dependencies, removed unused libraries, and added lockfiles/advisory validation.

**Changed files:**

- Identity/Identity.csproj
- Identity/packages.lock.json
- Identity/Dockerfile
- Frontend/package.json
- Frontend/package-lock.json
- Frontend/Dockerfile
- Frontend/scripts/audit-dependencies.mjs
- Frontend/README.md
- Frontend/demo/Test.ps1

**Regression tests and verification:**

- Release build zero warnings
- Official NuGet vulnerability scan zero vulnerable packages
- Runtime image builds and starts
- Fresh npmci passes; authoritative npm runtime audit0. Full scan has5affected chain entries for one advisory GHSA-vfj7-8cjw-p6xm, absent from runtimegraph.
- audit:dependencies passes exact exception and rejects new/runtime/patched/expired advisories.
- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

- .NET8 support ends November 2026; future production migration requires maintained runtime
- No patched braces release as of2026-10-03. Exception expires2026-10-17; ESLint9 retained due currentNext Reactplugin compatibility, not silent suppression. .NET dependency verification belongs other repositories.
- One unpatched development-only braces advisory is restricted to static lint globs; exact exception expires2026-10-17. Production graph and backend scans are clear. Identity .NET8 migration due before November2026 support end.

### O-03: Identity Git history retains database credentials and signing-secret material

**Status:** Mitigated for the local demo

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Identity: Historical credential material remains in existing Git history
Frontend: Shared local-demo operations scope.

**Original evidence:**

Heuristic scan inspected710 historical text blobs across203 reachable commits in four repos. Identity historical blobc8c626693d7f has PostgreSQL password atline9, Mongo credential atline10 and signing-secret material atline13; blob1f0d9fbd7004 has correspondingfields at10,11,14. Introduced/removed in history aroundb5e0b4e and7094647 (20July2025); earlier secret-bearing blobs trace to3929fe4/d676ccc. Current tracked sensitive settings are blank. Values are deliberately omitted; current-file links locate fields, while historical evidence must be opened using the identified commit/blob.

**Planned correction:**

Verify revocation/rotation of every exposed database credential and JWT secret, invalidate tokens signed with any exposed active key, review access logs, and use managed secrets plus automated history-aware secret scanning. History rewriting is a coordinated follow-up, not a substitute for rotation.

**Implemented correction or mitigation:**

Identity: Remove tracked current credentials; require generated fresh local secrets; safe ignored environment examples; isolate all task-created resources
Frontend: Generated fresh isolated secrets and removed current tracked credential defaults without inspecting external credential validity or rewriting historical Git.

**Changed files:**

- Identity/appsettings.json
- Identity/appsettings.Development.json
- Identity/.env.example
- Identity/Program.cs
- Frontend/demo/New-LocalEnvironment.ps1
- Frontend/demo/.env.example
- Frontend/demo/compose.yml
- Frontend/demo/verify-delivery.mjs

**Regression tests and verification:**

- Fresh local generated credentials used for isolated demo
- Required config has no historical/production fallback
- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

- Git history was preserved; historical external credentials were not validated or revoked. External rotation and any history rewrite require owners
- Historical external credentials remain unverified/unrevoked. Rotation and possible history rewrite require their owners.

### O-04: Frontend Identity and User workflows push and deploy on pull requests

**Status:** Fixed and verified

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Identity: Original Identity PR workflow pushed/deployed cloud images
Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.
Frontend: Shared local-demo operations scope.

**Original evidence:**

Three workflows use the same build-and-deploy job for pushmain and pull_requestmain with no event/branch deploy guard. Registry login, push:true and Azure publish-profile deployment occur in that PR job. Music correctly separates deploy behind pushmain guard. Same-repository PR runs with available secrets can deploy unmerged code; fork PRs lacking secrets reach deployment actions and fail.

**Planned correction:**

Separate build/test/image-validation from deploy, gate deployment to reviewed main pushes, use scoped protected environments and least-privilege credentials; add concurrency/rollback policy.

**Implemented correction or mitigation:**

Identity: Read-only validation workflow builds/tests/scans and local Docker build; all registry/cloud deployment actions removed
Frontend: Frontend pull request/main workflow is build/test/image-validation only, without publishing/deploying or production secrets; least permissions.
Frontend: All four repositories use validation-only pull-request CI without deployment/push/cloud secrets.

**Changed files:**

- Identity/.github/workflows/ci-cd.yml
- Frontend/.github/workflows/ci-cd.yml
- Frontend/.github/workflows
- Frontend/demo/Test.ps1
- Music/.github/workflows/ci-cd.yml
- User/.github/workflows/ci-cd.yml
- Identity/scripts/check-advisories.py
- Music/scripts/check-advisories.py
- User/scripts/check-advisories.py

**Regression tests and verification:**

- Source workflow contains no deployment/push/secrets action
- Equivalent local Release build and regression checks pass
- YAML source review confirms no login/push/deploy steps and no secrets; local equivalent npm validation commands run.
- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.
- Three advisory validators passed nine report-shape regressions each and actual current no-restore dependency reports, including both Music solution projects. Missing projects, nested lookup failures and vulnerabilities fail closed.

**Remaining limitations:**

- Remote CI run not triggered because no push/publish was authorized
- Hosted internal/fork GitHub execution intentionally not triggered for this local task.
- Remote CI was not triggered; equivalent local checks and workflow source were verified.

### O-05: Frontend deployment omits API build arguments and silently bakes fixed production hosts

**Status:** Fixed and verified

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.
Frontend: Shared local-demo operations scope.

**Original evidence:**

Dockerfile acceptsNEXT_PUBLIC_*API buildargs and runs nextbuild, but workflow supplies no build-args. API client defaults to three exact Azure hostnames in production. README describes variables configured on Azure App Service, although public Next variables are frozen at buildtime. Runtime App Service variable changes cannot redirect the shipped browser bundle.

**Planned correction:**

Provide explicit environment-specific buildargs, validate them beforebuild, remove silent production fallback, or serve a deliberate runtime public-config endpoint. Keep all service URLs and JWT issuer/audience aligned.

**Implemented correction or mitigation:**

Frontend: Explicit validated public build config, localdev5101/2/3 defaults and no silent cloud fallback. Docker requires three public build arguments.
Frontend: Mandatory explicit frontend API build arguments and local compile-time origins remove silent production fallback.

**Changed files:**

- Frontend/src/lib/config.ts
- Frontend/src/lib/request.ts
- Frontend/Dockerfile
- Frontend/.env.example
- Frontend/next.config.ts
- Frontend/.github/workflows/ci-cd.yml
- Frontend/README.md
- Frontend/demo/compose.yml

**Regression tests and verification:**

- Browser requests/media and WebSockets observed targeting127.0.0.1:5101/5102/5103.
- Live login/profile/catalogue/media/playlist/chat work in finalconfigured stack.
- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### O-06: The documented local stack cannot run together with the default ports

**Status:** Fixed and verified

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Identity: Original Identity forced port80 regardless configuration
Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.
Frontend: Shared local-demo operations scope.

**Original evidence:**

All three backends unconditionally UseUrls(http://0.0.0.0:80), while frontend development defaults to localhost5000,5001,5002. No checked-in compose/sharedInfrastructure project or launchSettings coordinates these repositories. Starting three dotnetrun processes collides on80 and frontend defaults cannotreach them. .NET8's base-image8080 default is explicitly overridden by these UseUrls calls, so it is not itself a container port defect here.

**Planned correction:**

Honor configurable ASPNETCORE_URLS/HTTP_PORTS or per-service launchprofiles, document the three ports and add a reproducible disposable development/test stack.

**Implemented correction or mitigation:**

Identity: Honor ASPNETCORE configuration; internal8080/publicloopback5101 with versioned Compose; mandatory explicit JWT/CORS/dependency config
Frontend: Document authoritative loopback3100 frontend and5101/5102/5103 matrix; dev script binds3100; root delivers isolated Compose prerequisites and secrets.
Frontend: Named isolated Compose, unique loopback host ports, bounded readiness and idempotent fixture scripts.

**Changed files:**

- Identity/Program.cs
- Identity/Dockerfile
- Identity/.env.example
- Identity/docs/LOCAL-CONTRACT.md
- Frontend/src/lib/config.ts
- Frontend/package.json
- Frontend/.env.example
- Frontend/README.md
- Frontend/demo/compose.yml
- Frontend/demo/Demo.ps1
- Frontend/demo/wait-ready.mjs
- Frontend/demo/seed.mjs

**Regression tests and verification:**

- Complete local APIs run without port collision; Identity readiness200 and real contracts pass
- All services launched concurrently, real browser workflows pass.
- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

- Shared setup is versioned in Frontend/demo because workspace root is not one Git repository
- Compose fresh environment/restart evidence belongsroot Frontend/docs/local-demo.

### O-07: Setup documentation describes incompatible identity claims and incomplete shell setup

**Status:** Fixed and verified

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Identity: Identity had no README and setup documents used inconsistent issuer/audience and omitted password requirements
Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.
Frontend: Shared local-demo operations scope.

**Original evidence:**

User README examples set issuer spotibuds-auth and audience spotibuds-api; Identity defaults are SpotibudsIdentity and SpotibudsApp. Using these documents together causes tokenvalidation failure. Music's bash example assigns settings without export and its dockerexample omits mandatory Blobconfiguration; architecture references an Infrastructure repo absent from this workspace. Identity has no README; frontendpassword policy omits the backend RequiredUniqueChars6 setting.

**Planned correction:**

Publish one authoritative environment matrix, valid shell-specific examples, complete prerequisite list, exactpassword policy and actual repository topology.

**Implemented correction or mitigation:**

Identity: Add Identity README pointing to the authoritative sibling-repository PowerShell setup and environment matrix; document GUID/ObjectId distinction, current session contracts and the exact password policy
Frontend: Publish topology, compatible issuer/audience, URL/build variables, exact8–100/six-unique password policy, localSMTP and clean npm commands.
Frontend: PowerShell guide documents exact prerequisites, commands, claims, URLs, accounts, privacy, recovery, persistence and reset scope.

**Changed files:**

- Identity/README.md
- Identity/docs/LOCAL-CONTRACT.md
- Identity/appsettings.json
- Identity/.env.example
- Frontend/README.md
- Frontend/src/app/register/page.tsx
- Frontend/src/app/reset-password/page.tsx
- Frontend/demo/README.md
- Frontend/demo/Test.ps1
- Frontend/demo/Demo.ps1

**Regression tests and verification:**

- Shared issuer/audience used by real sign-in, User/Music requests and 40 full-stack checks
- Repeated documented seed succeeds without duplicated relationships
- Readme/source contract review; actual lockfileinstall/type/lint/unit and stable-stack browser workflows exercised.
- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

- Shared fresh-start instructions and browser checks recorded in the workspace ledger
- Full clean shared-stack instructions verified by root.

### FR-01: Tokens in localStorage and third-party scripts increase XSS theft impact

**Status:** Mitigated for the local demo

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Access and rotating refresh tokens are JS-readable; reCAPTCHA script is loaded; no CSP header configured here. No actual XSS exploit established.

**Planned correction:**

Consider HttpOnly Secure refresh session with access token in memory and restrictive CSP; review all script origins.

**Implemented correction or mitigation:**

Frontend: Access token stays in memory and refresh in HttpOnly Strict cookie; remove third-party CAPTCHA/script/font dependencies and set local origin CSP and no-referrer.

**Changed files:**

- Frontend/src/lib/session.ts
- Frontend/src/lib/request.ts
- Frontend/next.config.ts
- Frontend/src/app/register/page.tsx
- Frontend/src/app/layout.tsx
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Live browser localStorage token/refreshToken are null before and after reload; session survives real cookie refresh.
- Source CSP restricts scripts to self, disallows objects/framing and has no third-partyscript origin.

**Remaining limitations:**

- CSP retains unsafe-inline for current Next streaming output; this reduces persistent credential theft but is not a proof against every XSS. Production nonce CSP/TLS remains a follow-up.

### FR-02: Unused ListeningHistory component sends pagination offset as limit

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

getListeningHistory(userId,skip) binds skip to limit, initially0 and offset stays0; songs changes callback and reload effect. No routed/imported use found, so no active user-flow impact asserted.

**Planned correction:**

Remove unused code or pass(userId,10,skip), stabilize cache dependency and test before reuse.

**Implemented correction or mitigation:**

Frontend: Removed unused broken history component; single routed history implementation remains.

**Changed files:**

- Frontend/src/components/ListeningHistory.tsx (removed)
- Frontend/src/app/user/[id]/listening-history/page.tsx

**Regression tests and verification:**

- Removed-file and no-import source review; routed105-entry browser pagination passes.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### FR-03: Unused admin statistics client route does not exist

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

Client requests /api/admin/statistics; server defines /api/admin/stats. No client caller found.

**Planned correction:**

Align route and camelCase response contract before exposing statistics.

**Implemented correction or mitigation:**

Frontend: Removed unused admin statistics client and response interface instead of leaving a dormant contract untested. The substantive admin catalogue UI remains.

**Changed files:**

- Frontend/src/lib/api.ts

**Regression tests and verification:**

- rg has no getStatistics/AdminStats caller or removed client route; source removal reviewed.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### FR-04: Realtime token query and forced LongPolling limit renewal and scaling

**Status:** Mitigated for the local demo

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Original evidence:**

FriendHub permanently embeds initial access_token in base URL even while accessTokenFactory later returns new token; server prioritizes query token for hubs. Every hub forces LongPolling. Expired-token reconnect / account-switch consequences require actual timed-token test; multi-instance load unverified.

**Planned correction:**

Avoid fixed token query, renew through shared session layer; use transport policy appropriate for production with tested fallback and backplane.

**Implemented correction or mitigation:**

Frontend: Current shared accessTokenFactory replaces fixed query credential; default SignalR transport negotiation supports WebSocket with fallback and generation-safe reconnect.

**Changed files:**

- Frontend/src/lib/managedHub.ts
- Frontend/src/lib/chatHub.ts
- Frontend/src/lib/friendHub.ts
- Frontend/src/lib/notificationHub.ts

**Regression tests and verification:**

- Native browser WebSocket negotiate/start observed againstlocalUser.
- Two-user actual offline/online automatic reconnect rejoins and receives messages/receipts.

**Remaining limitations:**

- Browser transports may carry access_token query because SignalR requires it; server log sanitation belongsUser. Multi-replica/backplane/proxy validation deferred.

### IU-R01: Multiple User instances cannot share realtime/presence state

**Status:** Deferred: production-only follow-up

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

No SignalR Redis/Azure backplane and stores are local memory. Under multiple instances clients/groups on instanceB receive no instanceA IHubContext publication, nowplaying exists only on writer instance, online/active suppression split.

**Planned correction:**

Configure backplane/managed SignalR and distributed TTL presence/nowplaying with connection sets, sticky routing where required; distributed job leader/lock.

**Implemented correction or mitigation:**

User: Documented single-instance realtime/presence/now-playing state; distributed delivery is a production follow-up.

**Changed files:**

- User/docs/LOCAL-DEMO.md

**Regression tests and verification:**

- Local multi-tab behavior tested; no multi-replica guarantee claimed.

**Remaining limitations:**

- Distributed coordination/backplane and durable cross-instance event routing remain unverified.

### IU-R02: RabbitMQ does not provide current delivery guarantees

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

Actual consumers disabled, no publishers wired to workflow. Dormant wrapper has no exchange QueueBind, publisher confirms/mandatory returns or retry/DLQ policy; failures are swallowed; one channel shared, async Eventing handler and immediate requeue risk.

**Planned correction:**

Document removal or deliberately wire outbox→confirmed publisher→bound queues→idempotent consumer with bounded retry/DLQ and channel concurrency safety.

**Implemented correction or mitigation:**

User: Removed dormant RabbitMQ consumer/helpers instead of implying broker delivery; shared synchronous commands persist messages/notifications.

**Changed files:**

- User/Services/RabbitMqService.cs (removed)
- User/RabbitMQ (removed)
- User/docs/LOCAL-DEMO.md

**Regression tests and verification:**

- Source service registrations and actual REST/hub persisted delivery checks.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### IU-R03: Refresh tokens stored plaintext and authenticated subject is not bound to revoke/refresh

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Plaintext refresh credentials and mixed bearer/refresh authorization

**Original evidence:**

Token raw stored in indexed DB; database read leak obtains reusable credentials. Any valid bearer can submit another user's refresh/revoke credential; security should depend on refresh itself but current mixed-auth policy is inconsistent.

**Planned correction:**

Hash at rest, secure cookie/mobile storage transport, apply coherent possession/subject/session model and family revocation.

**Implemented correction or mitigation:**

Identity: SHA-256 hashes at rest; HttpOnly cookie transport; refresh possession model and stable family identity; no raw JSON credentials

**Changed files:**

- Identity/Services/SessionService.cs
- Identity/Controllers/AuthController.cs
- Identity/Entities/RefreshToken.cs

**Regression tests and verification:**

- Persisted PostgreSQL hashes are exactly 64 hex characters
- Cookie HttpOnly/SameSite flags verified
- Replay/revocation/expiry negative cases and cross-service sid denials pass

**Remaining limitations:**

- Loopback HTTP cookie requires explicit Development; other environments require HTTPS

### IU-R04: No committed Identity or User behavioral test suites

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Original Identity had no behavioral test project
User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

rg --files found Music/tests only, no Identity/User test projects. Compilation cannot prove workflows/security.

**Planned correction:**

Add security negative cases and contract/integration tests for findings, meaningful multi-service state/fault tests.

**Implemented correction or mitigation:**

Identity: Committed real middleware/persisted DB integration suite; full-stack state assertions; User real Mongo/hub suite additionally authored
User: Committed actual authorization/Mongo/SignalR/storage regressions and validation-only CI with fresh disposable dependencies.

**Changed files:**

- Identity/tests/Identity.Tests/Identity.Tests.csproj
- Identity/tests/Identity.Tests/IdentityFactory.cs
- Identity/tests/Identity.Tests/SessionIntegrationTests.cs
- Identity/Identity.sln
- User/tests/User.Tests
- User/User.csproj
- User/.github/workflows/ci-cd.yml

**Regression tests and verification:**

- Identity 12 tests pass Debug and Release
- Live 40 checks pass against isolated PostgreSQL/Mongo/Mailpit
- User 19 tests pass with zero skips against isolated real Mongo, SignalR long polling and actual Blob storage
- Full persisted suite run locally; remote CI not triggered.

**Remaining limitations:**

- Browser acceptance is tracked in shared ledger; no mock-only helper claim

### IU-R05: Password recovery/email verification/rate-limiting workflows absent

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Identity: Advertised recovery and public account rate limits absent

**Original evidence:**

RequireConfirmedEmail=false; no forgot/reset-password/email confirmation actions; no ASP.NET rate limiter registration/use found in Identity/User. Identity login lockout exists (5 failures, 15 minutes), but registration/avatar/feed/unprotected endpoints lack per-user throttling.

**Planned correction:**

Define product requirement and add verified recovery/confirmation and gateway+application limits appropriate to public endpoints.

**Implemented correction or mitigation:**

Identity: Guest reset flow with actual Mailpit SMTP; expiring hashed single-use tokens; generic known/unknown messages; lockout and local rate limiting; email-change limitation explicit

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/Services/RecoveryMailer.cs
- Identity/Entities/PasswordReset.cs
- Identity/Program.cs

**Regression tests and verification:**

- Actual captured reset message used successfully once
- Invalid/reused/expired tokens rejected and previous sessions revoked
- Mailer outage adapter returns same 503 for known/unknown

**Remaining limitations:**

- External email confirmation and delivery are production-only follow-ups; public endpoints limited to 100 requests/minute per IP

### IU-R06: Unused avatar helper can set public Azure container access

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

User: Original audit reproduced or confirmed in initial source; local correction implemented.

**Original evidence:**

UpdateContainerAccessLevelAsync changes PublicAccessType.Blob; source has no callers. Do not assert deployed container is public based on unused method.

**Planned correction:**

Remove/guard public-access helper and verify production container policy/SAS scope separately.

**Implemented correction or mitigation:**

User: Removed unused public-container avatar helper; current avatar container creation is private and proxy policy enforced.

**Changed files:**

- User/Services/AzureBlobService.cs

**Regression tests and verification:**

- Real anonymous private-avatar denial and container creation policy review.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### MR-01: Uploads

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Only playlist cover validates declared MIME and10MB size; MIME is client-controlled, no signature/decode verification. Admin audio/image uploads have no specific file type/duration/size rules beyond server defaults. Cover methods force.jpg and snippets force.mp3 without transcoding; streams passed by Admin/playlist upload are not disposed. Malformed media and orphaned blobs after metadata failure are plausible. Recommend media signature/decoder checks, format-preserving storage, explicit upload limits and using await using for streams. Actual67byte PNG cover upload returned Content-Type:image/jpeg from proxy without transcoding.

**Planned correction:**

Add explicit payload limits, decoded-content validation, supported MIME policy and replacement cleanup.

**Implemented correction or mitigation:**

Music: Decode image bytes with bounded Skia dimensions/types; validate entire PCM WAV structure, full bounded ffmpeg decode for MP3/FLAC/Ogg; file size/types preserved, streams disposed.

**Changed files:**

- Music/Services/AzureBlobService.cs
- Music/Services/MediaCommands.cs
- Music/Program.cs
- Music/Dockerfile

**Regression tests and verification:**

- WaveParserChecksEntirePayloadAndDuration
- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Misleading.jpg with PNGcontent served image/png; bogus image/audio400. TruncatedWAV rejected; malformedcover after staging validnewaudio preserves prior metadata.

**Remaining limitations:**

- PCM WAV/PNG decoded and persisted in tests; compressed-format fixtures are not in xUnit suite.

### MR-02: Indexes/concurrency

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

No application-created unique/index definitions for artist name, artist/album association, playlist ownership, or catalogue search. Admin duplicate checks are check-then-insert, not unique constraints. Production database indexes might exist outside repo and were not inspected; validate exact deployed index inventory and duplicate concurrent creations.

**Planned correction:**

Inventory and provision indexes/unique constraints through versioned migrations; use atomic writes for invariants.

**Implemented correction or mitigation:**

Music: Versioned/indexed Music data and single-instance mutation gate. Unique artist name and artist/album constraints; canonical relationship/playlist owner indexes initialized idempotently.

**Changed files:**

- Music/Services/MediaCommands.cs
- Music/Services/CatalogueService.cs
- Music/Services/PlaylistService.cs

**Regression tests and verification:**

- CatalogueCommandsAuthorizePersistRenameRelationshipsRepairAndDeleteThroughEveryRoute
- PlaylistsPersistContiguousOrderAtomicUniquenessPrivacyAndOwnerPermissions
- Concurrent casevariant duplicate artists409; six-way song add exactly one reference. Maintenance completes indexes before ready.

**Remaining limitations:**

- Single Music instance required; multiple replicas need distributed locking/transaction-only command redesign.

### MR-03: Caching memory/background work

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Image download buffers arbitrary blob entirely into MemoryStream then ToArray without byte/dimension caps;50MB memory cache limit does not cap transient allocations/Redis entries. Untracked Task.Run cache writes lack cancellation/lifecycle tracking and swallow Redis errors. No single-flight protection so concurrent cache misses duplicate downloads. Add bounded validated media reads and observed/throttled cache population.

**Planned correction:**

Bound caches and background work, observe exceptions, honor cancellation and avoid capturing disposed request services.

**Implemented correction or mitigation:**

Music: Removed media caching/background Task.Run writes and transient whole-blob downloads. Streams bounded Blob content directly; only bounded validation allocations and cancellable observed cleanup worker remain.

**Changed files:**

- Music/Controllers/MediaController.cs
- Music/Services/AzureBlobService.cs
- Music/Services/MediaCommands.cs

**Regression tests and verification:**

- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Exact streaming tests; no memory/Redis allocation tier, untrackedTask.Run, or cache-write task remains. Upload memory bounded10/50MiB.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### MR-04: Blob public access

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

UpdateContainerAccessLevelAsync can create/change whole containers to PublicAccessType.Blob, but no route/caller invokes it in inspected source. It is not evidence that deployed containers are public; remove unsafe dead utility or explicitly restrict/document intended usage.

**Planned correction:**

Remove or guard dormant public-access helpers; verify private container policy and scoped media access.

**Implemented correction or mitigation:**

Music: Removed unused public-container access helper; uploads explicitly private containers, catalogue proxy enforces references.

**Changed files:**

- Music/Services/AzureBlobService.cs

**Regression tests and verification:**

- Persisted upload path and source inspection
- No PublicAccessType.Blob or SetAccessPolicy public utility remains. Azure/Azurite media bytes served through restricted application identities.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### MR-05: Hosting/configuration

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

UseUrls hard-codes0.0.0.0:80 overriding normal configurable URL expectations; no forwarded-header middleware exists before production HTTPS redirection. Reverse-proxy TLS termination behavior, image non-root strategy, operational backups/metrics and deployments require separate validation by root audit.

**Planned correction:**

Document and verify the actual proxy, forwarded-header, port and TLS configuration.

**Implemented correction or mitigation:**

Music: Configurable Kestrel URLs/ports, local loopback compose exposure, .NET10 nonroot8080 image. Demo uses localHTTP; no unsupported production proxy/TLS claims.

**Changed files:**

- Music/Program.cs
- Music/Dockerfile
- Music/.dockerignore
- Music/README.md

**Regression tests and verification:**

- Release build and 21 persisted regressions
- Root final Docker build and nonroot/loopback/container-content inspection
- Root final docker compose build passed for all four application images and all APIs became ready. Actual docker inspect Config.User: Music/Identity/User1654; Frontendnextjs. Music listens on8080 internally; all9 published compose mappings bind127.0.0.1. Root docker exec confirmed Frontend runtime contains no /app/demo/.env.localdemo, account credentials, fixture assets or .git. Music Release21tests passed with0warnings/0skips.

**Remaining limitations:**

- Local single-instance HTTP demo verified. Production reverse-proxy/forwarded-header/TLS configuration, cloud policy, immutable-image hardening, backups and observability require separate production validation.

### MR-06: Documentation

**Status:** Fixed and verified

**Origin:** Original audit. Conservative combined contributor dispositions.

**Applicability:**

Music: Confirmed against initial code and original audit; implemented local demo correction.

**Original evidence:**

Mongo connectivity tests execute lazily during DI rather than startup as docs claim. Warning inventory says30 remaining while actual Release build produces34warnings. README describes public playlist reads correctly, so public ownership metadata is treated as an intentional design choice, not a confirmed privacy authorization defect.

**Planned correction:**

Update docs to the implemented architecture and executable setup commands.

**Implemented correction or mitigation:**

Music: README rewritten around actual single-instance transactions/privateBlob/stablemedia/lazy reconnection/liveness/readiness/config/commands/testing. Removed misleading warning inventory and inactive service claims.

**Changed files:**

- Music/README.md
- Music/.env.example
- Music/docs/remediation.json

**Regression tests and verification:**

- Release build/test/advisory results
- Release solutionbuild0warnings; latest21tests passed;NuGet knownvulnerabilities0. Root demo guide authoritative for verified orchestration.

**Remaining limitations:**

- Complete orchestration/browser walkthrough reported by root ledger.

### O-R01: Production recovery and observability remain unverified

**Status:** Deferred: production-only follow-up

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Frontend: Shared local-demo operations scope.

**Original evidence:**

No backup/restore runbook, monitoring/alerting configuration, production SLOs or restore evidence present in supplied repositories. Azure platform configuration, database backups, retention, health-probe routing, TLS termination and deployment logs were not accessed.

**Planned correction:**

Provide deployment evidence and rehearse recovery on disposable restored data; wire dependency-aware readiness and alerts.

**Implemented correction or mitigation:**

Frontend: Document local recovery/readiness; production backups, restoration drills, centralized observability and incident response remain separate.

**Changed files:**

- Frontend/demo/README.md

**Regression tests and verification:**

- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

- No production recovery or cloud operations executed.

### O-R02: Container privilege and build-context hygiene need hardening

**Status:** Mitigated for the local demo

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Identity: Original Identity runtime used root and broad Docker context
Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.
Frontend: Shared local-demo operations scope.

**Original evidence:**

Identity/Music/User final images omit USER and bind80; nonroot app user available in .NET8 base is not selected. Frontend/Identity/User lack .dockerignore, copying Git/build outputs and possible localfiles into buildcontext. No claim that secrets are present in finalimages; current sensitive source settings areblank. Azure runtime overrides were not inspected.

**Planned correction:**

Use a nonroot user and configurablehighport; exclude Git/localsettings/buildoutputs; pin images and action revisions where policyrequires.

**Implemented correction or mitigation:**

Identity: Runtime USER APP_UID; ignore credentials/Git/tests/build artifacts; current supported runtime patch
Frontend: Node24 nonroot1001 standalone image and explicit build-context exclusions for secrets, accountfixture, localassets/results,git,node_modules/cache/build.
Frontend: Application images run nonroot; build contexts exclude credentials, Git, tests and generated artifacts; all exposed ports are loopback.

**Changed files:**

- Identity/Dockerfile
- Identity/.dockerignore
- Frontend/Dockerfile
- Frontend/.dockerignore
- Frontend/.gitignore
- Frontend/demo/compose.yml
- Frontend/demo/inspect-runtime.mjs

**Regression tests and verification:**

- Nonroot container image built/started and accounts/Mailpit flow work
- Dockerfile source nonroot review; root final image nonroot/context inspection.
- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

- Production image hardening/registry scanning and cloud deployment policies are separate follow-ups
- Final runtime inspection verified four nonroot application containers, nine loopback bindings and exclusion of generated private files. Production capability, immutable-image and registry policies need separate hardening.
- Vendor infrastructure initialization privilege and production immutable-image/registry/cloud policies need separate hardening.

### O-R03: Full operational load browser matrix and cloud-policy validation are still needed

**Status:** Deferred: production-only follow-up

**Origin:** Original audit. Shared operations ledger is authoritative.

**Applicability:**

Frontend: Shared local-demo operations scope.

**Original evidence:**

No destructive fuzzing, productionloadtest, accessibilityscreenreader audit, cross-browsermobilematrix, fullSASyearrollover test or realAzureACL test performed. Browser smoke used one browser and localAzurite coveredupload/downloadbehavior.

**Planned correction:**

Add isolated stress/failure tests and browser/accessibility matrix, then verify leastprivilegeBlob/DB/Redis/broker networking in the actualdeployment configuration.

**Implemented correction or mitigation:**

Frontend: Execute local real browser/media/concurrency/outage/restart scenarios; defer broad browser, operational load and cloud policy matrix.

**Changed files:**

- Frontend/demo/Test.ps1
- Frontend/demo/outage-restart-integration.mjs
- Frontend/tests/browser
- Frontend/demo/README.md

**Regression tests and verification:**

- See verification-summary.json for exact executed commands/results; no remote production or CI deployment performed.

**Remaining limitations:**

- Chromium/IAB basic desktop/mobile tested; no exhaustive browser matrix, production load or cloud policy validation.

## Issues encountered during task

### NEW-I-01: Concurrent password/role changes could race a login's authenticated snapshot

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Identity: Concurrent password/role changes could race a login's authenticated snapshot

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Login and password/role mutations lock the stable account row; re-read the account before credential check and session issuance; preserve lockout commits

**Implemented correction or mitigation:**

Identity: Login and password/role mutations lock the stable account row; re-read the account before credential check and session issuance; preserve lockout commits

**Changed files:**

- Identity/Controllers/AuthController.cs

**Regression tests and verification:**

- All twelve middleware/persisted regression tests pass after locking change
- Live role transitions revoke old privilege and issue current role only
- Four old-password logins racing password change leave every returned old session revoked and zero persisted active families

**Remaining limitations:**

- No hostile unbounded concurrency/load test performed

### NEW-I-02: An older in-flight reconciliation could overwrite a newer acknowledged remote profile after both immutable work rows were removed

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Identity: An older in-flight reconciliation could overwrite a newer acknowledged remote profile after both immutable work rows were removed

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

All authority mutations and reconciliations acquire the same PostgreSQL account row lock, re-read canonical fields, and retain outbox work until the serialized remote write is acknowledged

**Implemented correction or mitigation:**

Identity: All authority mutations and reconciliations acquire the same PostgreSQL account row lock, re-read canonical fields, and retain outbox work until the serialized remote write is acknowledged

**Changed files:**

- Identity/Services/ProfileReconciler.cs
- Identity/Controllers/AuthController.cs
- Identity/docs/LOCAL-CONTRACT.md

**Regression tests and verification:**

- All twelve middleware/persisted regressions pass in Release after serialization
- Four concurrent real PostgreSQL privacy mutations finish with Mongo equal to the canonical authority
- Live integration runner passes all 40 checks

**Remaining limitations:**

- Single-instance bounded reconciler; no distributed leasing/load test

### NEW-S01: Actual browser hard reload discarded a refresh response cookie after one-step credential consumption, causing the next bootstrap to replay its consumed predecessor

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Identity: Actual browser hard reload discarded a refresh response cookie after one-step credential consumption, causing the next bootstrap to replay its consumed predecessor
Frontend: Applicable to the shared Identity/frontend renewal contract. The first complete 20-case run passed 19 and failed catalogue deletion after seven refresh200 responses followed by two refresh401 responses; focused reruns had passed, exposing an intermittent navigation race.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Two-phase browser refresh installs a pending cookie before consuming its predecessor, then activates that installed successor without another cookie response;30-second token-free operation coordination and hashed-only durable stages preserve strict consumed-token revocation

**Implemented correction or mitigation:**

Identity: Two-phase browser refresh installs a pending cookie before consuming its predecessor, then activates that installed successor without another cookie response;30-second token-free operation coordination and hashed-only durable stages preserve strict consumed-token revocation
Frontend: Cookie installation and predecessor consumption are separate phases. A random operation UUID/time is persisted only for 30 seconds under the refresh Web Lock; interrupted documents resume that operation. Completion receives the already-installed pending HttpOnly cookie and does not mutate another cookie. Consumed-predecessor replay still revokes the family. Generation checks, cancellation and marker clearing prevent logout/account-switch resurrection.

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/Services/SessionService.cs
- Identity/Entities/RefreshToken.cs
- Identity/Data/IdentityDbContext.cs
- Identity/IdentityServiceExtensions.cs
- Identity/Services/ProfileReconciler.cs
- Identity/Migrations/20261003184832_BrowserCookieHandoff.cs
- Identity/tests/Identity.Tests/SessionIntegrationTests.cs
- Frontend/demo/identity-integration.mjs
- Frontend/demo/outage-restart-integration.mjs
- Frontend/src/lib/session.ts
- Frontend/tests/session.test.ts
- Frontend/tests/browser/demo.spec.ts
- Frontend/README.md

**Regression tests and verification:**

- Passed: 16 Identity persisted middleware/SQLite integration tests, including discarded prepare cookie, discarded completion body, exact nonce/expiry and strict predecessor replay assertions
- Passed: full Chromium suite 21/21, including actual interrupted navigation recovery, protected playlists/reload, HttpOnly successor and logout
- Passed: actual PostgreSQL live 40 asserts one pending hashed successor, same-intent concurrent completion retries, no completion cookie mutation and strict consumed-parent family revocation
- Passed: final 26 outage checks plus two CLI status checks; an installed pending refresh cookie survives full API restart and activates without another Set-Cookie
- Frontend unit29/29 pass, including staged lost-completion/module reload, operation expiry, account switch/logout protection, shared ten-second timeout and sign-out ownership races.
- Actual Chromium server-finished interruption case passes both lost-prepare-cookie and lost-completion-body modes with real hard navigation. Protected playlists, another reload, token-free storage, effective HttpOnly successor cookie and logout are verified.
- Actual full administrator create/edit/discover/delete case passes on the staged client.
- The preceding failedfull20 evidence (19passed/1failed) is preserved in docs/frontend-browser-discovery.json.
- Final complete documented run8951 PASS21/21 Chromium workflows (0skip/flaky); frontend29 units/type/lint/format/build/dependency checks passed. See docs/frontend-browser-verification.json.

**Remaining limitations:**

- Single-instance local demo; operation coordination and preparation expire after 30 seconds
- Restart persistence requires the same injected signing key; distributed replicas and key rotation are separate production concerns
- Identity independently verifies unconditional consumed-predecessor replay revocation; this browser proof uses local Chromium with Web Locks.

### NEW-I03: Concurrent forgot-password requests could invalidate old links before either new insert, leaving multiple unused links; successful reset consumed only its selected credential

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Identity: Concurrent forgot-password requests could invalidate old links before either new insert, leaving multiple unused links; successful reset consumed only its selected credential

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Forgot-password issuance locks and reloads the same account row, invalidates older links and inserts the newest within one transaction; successful reset invalidates every other outstanding link under its existing account lock

**Implemented correction or mitigation:**

Identity: Forgot-password issuance locks and reloads the same account row, invalidates older links and inserts the newest within one transaction; successful reset invalidates every other outstanding link under its existing account lock

**Changed files:**

- Identity/Controllers/AuthController.cs
- Identity/tests/Identity.Tests/SessionIntegrationTests.cs
- Frontend/demo/identity-integration.mjs

**Regression tests and verification:**

- Passed: persisted regression injects a second outstanding link, resets with the selected link, proves both are consumed, rejects the other link and authenticates only with the resulting password
- Passed: actual PostgreSQL/Mailpit live 40 concurrently requests four links, asserts exactly one current link, selects its actual email by stored hash and invalidates every outstanding link on successful reset

**Remaining limitations:**

- Reset mail is delivered only to the isolated local Mailpit sink; production email verification and delivery are separate follow-ups

### NEW-M01: Azure retry aggregate dependency status

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Music: Encountered during actual Azure retry exhaustion while the isolated local Azurite dependency was unavailable.

**Discovery evidence:**

A cover replacement during the local Azurite outage returned500 because Azure SDK retries raised an AggregateException containing transport dependency errors. The outage reproduction identified the missing classification; current persisted endpoint-failure regression asserts503 and prior bytes/metadata.

**Planned correction:**

Azure SDK aggregates retry transport failures; classify recursively only known dependency inners, returning503 and preserving previous media.

**Implemented correction or mitigation:**

Music: Azure SDK aggregates retry transport failures; classify recursively only known dependency inners, returning503 and preserving previous media.

**Changed files:**

- Music/Services/DemoRules.cs
- Music/Program.cs
- Music/Controllers/AdminController.cs

**Regression tests and verification:**

- MediaIsByteAccuratePrivateMimeCorrectAndReplacementFailurePreservesWorkingObject
- Unavailable real Blob endpoint503, persisted previous URL/title and exact oldbytes unchanged.

**Remaining limitations:**

- No reachable defect intentionally deferred.

### NEW-M02: Supplied-session public reads hid Identity outages as anonymous empty lists

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Music: Found during actual PostgreSQL outage after initial remediation

**Discovery evidence:**

Private owner playlist listing could fall back to anonymous200 when supplied JWT session validation failed.

**Planned correction:**

Reject a supplied revoked/invalid bearer401 and unavailable Identity validation503 before public reads.

**Implemented correction or mitigation:**

Music: Reject a supplied revoked/invalid bearer401 and unavailable Identity validation503 before public reads.

**Changed files:**

- Music/Program.cs
- Music/tests/Music.Tests/PersistedHttpTests.cs
- Music/tests/Music.Tests/DependencyFailureTests.cs

**Regression tests and verification:**

- PlaylistsPersistContiguousOrderAtomicUniquenessPrivacyAndOwnerPermissions
- RealJwtMiddlewareRejectsAnonymousForeignRoleRevokedAndUnavailableSessions
- Final documented Test.ps1 -Browser -BuildImages run8951 completed exit0 on2026-10-03; Music persisted HTTP suite21/21 passed with0skips. The private-owner listing regression asserts503 on session dependency failure, unchanged playlist count, restored access to the existing private list and401 for a revoked supplied bearer. Root's final40 live Identity checks also passed across the persisted service boundaries.

**Remaining limitations:**

- Identity dependency failure intentionally returns503. Production availability/load validation and distributed coordination remain separate from this isolated single-instance demo.

### NEW-M03: Credentialed frontend requests needed explicit CORS credentials permission

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Music: Actual browser request used credentials:include against exact-origin Music CORS

**Discovery evidence:**

Browser catalogue/playlists blocked despite healthy APIs because allow-credentials was missing.

**Planned correction:**

Add AllowCredentials to the existing exact-origin policy; preserve rejection of unapproved origins.

**Implemented correction or mitigation:**

Music: Add AllowCredentials to the existing exact-origin policy; preserve rejection of unapproved origins.

**Changed files:**

- Music/Program.cs
- Music/tests/Music.Tests/DependencyFailureTests.cs

**Regression tests and verification:**

- CorsHasExactAllowlistOnActualAndPreflightRequests
- Actual HTTP GET/preflight regression verifies the exact allowed origin with credentials:true and no CORS headers for an attacker origin. Final documented run8951 passed all21 Music regressions and all21 rebuilt-image Chromium workflows with0skips/0flaky cases; catalogue and playlist browser requests succeeded against the loopback services.

**Remaining limitations:**

- The configured loopback origin and Chromium workflows are verified. Production TLS/reverse-proxy configuration and a broader browser matrix require separate validation.

### NEW-M04: Multipart optional field clearing could report success while preserving stale text

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Music: Encountered during actual admin UI artist edit; the same form-binding behavior also affected song Genre and optional AlbumId.

**Discovery evidence:**

The browser submitted Bio empty, the route returned200, and a subsequent artist GET retained its previous biography. Default MVC form binding had converted empty input to null before the shared patch command.

**Planned correction:**

Preserve explicit empty values through per-field form metadata. Bio/Genre clear, omitted fields preserve, empty AlbumId detaches and reindexes, and supplied blank required fields fail400 with prior state intact.

**Implemented correction or mitigation:**

Music: Preserve explicit empty values through per-field form metadata. Bio/Genre clear, omitted fields preserve, empty AlbumId detaches and reindexes, and supplied blank required fields fail400 with prior state intact.

**Changed files:**

- Music/Controllers/Contracts.cs
- Music/tests/Music.Tests/PersistedHttpTests.cs
- Music/README.md

**Regression tests and verification:**

- MultipartEditsClearExplicitOptionalTextPreserveOmittedFieldsAndRejectRequiredBlanks
- Actual JWT/admin multipart requests assert persisted artist biography/name and song genre/album, former album projection, rejected-field no-mutation and unchanged exact prior WAV bytes. Final documented run8951 passed the Release Music suite21/21 with0warnings/0skips, all four application Docker builds and all21 rebuilt-image Chromium workflows with0skips/0flaky cases, including the admin artist biography clear/readback regression.

**Remaining limitations:**

- Verified for the isolated single-instance local demo. Production catalogue load and broader browser certification were not executed.

### NEW-U01: A release-only image-library license gate blocked the User container build.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

User: Encountered and corrected during this task.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Replaced ImageSharp with current MIT SkiaSharp plus Linux native assets; strict decoded-content validation.

**Implemented correction or mitigation:**

User: Replaced ImageSharp with current MIT SkiaSharp plus Linux native assets; strict decoded-content validation.

**Changed files:**

- User/User.csproj
- User/Services/AzureBlobService.cs

**Regression tests and verification:**

- Release/native/Docker builds passed; actual adversarial avatar regressions.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-U02: Message/social/history writes could commit only one projection on interruption.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

User: Encountered and corrected during this task.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Added bounded snapshot transactions for authoritative documents, notifications and projections.

**Implemented correction or mitigation:**

User: Added bounded snapshot transactions for authoritative documents, notifications and projections.

**Changed files:**

- User/Services/MongoTransactions.cs
- User/Services/ChatCommands.cs
- User/Services/SocialCommands.cs
- User/Services/HistoryService.cs

**Regression tests and verification:**

- Real Mongo rollback and convergent canonical state tests.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-U03: Wrong JSON types in a profile patch could trigger500.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

User: Encountered and corrected during this task.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Explicitly validate object/string/null/boolean kinds before any writes.

**Implemented correction or mitigation:**

User: Explicitly validate object/string/null/boolean kinds before any writes.

**Changed files:**

- User/Controllers/UsersController.cs

**Regression tests and verification:**

- Malformed profile patch regression returns400 with unchanged stored values.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-U04: Avatar publication could succeed after profile removal or concurrent replacement.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

User: Encountered and corrected during this task.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Require CAS matched count before publication; delete losing upload and retain durable cleanup intent.

**Implemented correction or mitigation:**

User: Require CAS matched count before publication; delete losing upload and retain durable cleanup intent.

**Changed files:**

- User/Controllers/UsersController.cs
- User/Services/AzureBlobService.cs

**Regression tests and verification:**

- Two real concurrent avatar uploads produce one winner and clean losing blob.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-U05: Client playback metadata could invent songs and poison artist aggregates.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

User: Encountered and corrected during this task.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Validate existence and use canonical title/artists/cover/duration from Music.

**Implemented correction or mitigation:**

User: Validate existence and use canonical title/artists/cover/duration from Music.

**Changed files:**

- User/Services/CanonicalSongReader.cs
- User/Services/HistoryService.cs
- User/Controllers/FeedController.cs

**Regression tests and verification:**

- Forged/unknown/overduration/catalogue outage no-side-effect regressions.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-U06: Reloading live playback reactions queried an ephemeral ID instead of the durable post.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

User: Encountered during actual browser acceptance and server contract review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Resolve validated now-playing read IDs to the existing persisted recent-song post without creating data on reads.

**Implemented correction or mitigation:**

User: Resolve validated now-playing read IDs to the existing persisted recent-song post without creating data on reads.

**Changed files:**

- User/Controllers/FeedController.cs
- User/tests/User.Tests/AdditionalIntegrityTests.cs

**Regression tests and verification:**

- Persisted regression checks empty reads have no side effects, live and saved post reads return the same reaction, and playback expiration preserves durable reactions.
- Final documented full command passed all19 User tests and all21 browser workflows; the real feed case asserts the canonical post identity and reaction persistence through live-card reload and history transition.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F01: Playlist detail and initial mobile sidebar overflow the viewport

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Responsive wrapping playlist header/rows, named row actions and overlay/collapsed mobile sidebar without desktop contentpadding.

**Implemented correction or mitigation:**

Frontend: Responsive wrapping playlist header/rows, named row actions and overlay/collapsed mobile sidebar without desktop contentpadding.

**Changed files:**

- Frontend/src/app/playlists/[id]/page.tsx
- Frontend/src/components/layout/AppLayout.tsx
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Root CUA at 390x844 reproduced original horizontal overflow (document scrollWidth 436px).
- Actual focused Chromium at 390x844 reports document.scrollWidth &lt;= document.clientWidth; the named Play Morning Loop control is visible.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F02: Private friends disappear from directories and chat headers

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the original frontend; reproduced against current source and addressed in this work.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Use bounded50-profile permitted summary batches for privatefriend directories/chat headers, preserve knownidentity without forbidden detailed-profile reads.

**Implemented correction or mitigation:**

Frontend: Use bounded50-profile permitted summary batches for privatefriend directories/chat headers, preserve knownidentity without forbidden detailed-profile reads.

**Changed files:**

- Frontend/src/app/friends/page.tsx
- Frontend/src/app/chat/[id]/page.tsx
- Frontend/tests/browser/demo.spec.ts
- Frontend/src/app/user/[id]/page.tsx

**Regression tests and verification:**

- Root live Friends UI exposed accepted private Bob disappearing behind a swallowed 403.
- Actual focused Chromium shows Bob in Friends, preserves a non-empty directory and opens the existing chat with a Bob header.

**Remaining limitations:**

- The same permitted batch strategy also replaces detailed profile reads in the profile friends popup; the final suite exercises directory/chat behavior.

### NEW-F03: Feed reactions use guessed post IDs and an unsupported emoji

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable; discovered during actual local demo validation or source contract review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Feed preload and reaction writes now use server-issued postId; now-playing writes retain contextType, songId and recipient. Supported heart emoji replaces the unsupported face. Per-post pending state prevents duplicate clicks, failed writes roll back and show errors, and session clearing invalidates the reaction cache.

**Implemented correction or mitigation:**

Frontend: Feed preload and reaction writes now use server-issued postId; now-playing writes retain contextType, songId and recipient. Supported heart emoji replaces the unsupported face. Per-post pending state prevents duplicate clicks, failed writes roll back and show errors, and session clearing invalidates the reaction cache.

**Changed files:**

- Frontend/src/app/feed/page.tsx
- Frontend/src/lib/feedTypes.ts
- Frontend/src/lib/session.ts
- Frontend/src/lib/reactionCache.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Fresh-image actual Chromium adds one supported heart reaction to live now-playing, reloads with the heart visibly selected, clears now-playing and still sees the selected heart on the recent-song slide. Canonical persisted API reaction remains exactly once.
- Session-scoped reaction cache clearing and per-post pending/error behavior reviewed; User persisted regression covers canonical resolution.
- Final complete documented run8951 PASS21/21 Chromium workflows (0skip/flaky); frontend29 units/type/lint/format/build/dependency checks passed. See docs/frontend-browser-verification.json.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F04: Notification read failures silently discard failure feedback

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable; discovered during actual local demo validation or source contract review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Read, mark-all-read, handle and deletion failures are visible. Navigation after marking a message notification waits for success; server deletion completes before local state changes.

**Implemented correction or mitigation:**

Frontend: Read, mark-all-read, handle and deletion failures are visible. Navigation after marking a message notification waits for success; server deletion completes before local state changes.

**Changed files:**

- Frontend/src/contexts/NotificationContext.tsx
- Frontend/src/components/ui/NotificationDropdown.tsx
- Frontend/src/app/notifications/page.tsx
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Actual Chromium controlled 503 for mark-all-read keeps the action available and displays the failure; actual retry persists read status and reload returns unreadCount zero.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F05: Profiles have no visible follow or unfollow workflow

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable; discovered during actual local demo validation or source contract review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

A guarded Follow/Unfollow button loads actual owner-scoped follow state, persists each change, reports failures inline and restores persisted state after reload.

**Implemented correction or mitigation:**

Frontend: A guarded Follow/Unfollow button loads actual owner-scoped follow state, persists each change, reports failures inline and restores persisted state after reload.

**Changed files:**

- Frontend/src/app/user/[id]/page.tsx
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Actual two independent ordinary users: Follow persists true, reload shows Unfollow, Unfollow persists false and resets accessible pressed state.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F06: Profile Message sends a Mongo profile ID as a chat participant

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable; discovered during actual local demo validation or source contract review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Profile Message uses the account Identity GUID and exposes chat-creation failure feedback.

**Implemented correction or mitigation:**

Frontend: Profile Message uses the account Identity GUID and exposes chat-creation failure feedback.

**Changed files:**

- Frontend/src/app/user/[id]/page.tsx
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Actual profile Message opens a persisted chat with exactly both Identity GUID participants and displays the correct other-user header.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F07: Content policy blocks local audio metadata preview in the admin song form

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable; discovered during actual local demo validation or source contract review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

CSP media-src permits blob URLs so selected audio files can load native metadata; production script and connect restrictions remain scoped.

**Implemented correction or mitigation:**

Frontend: CSP media-src permits blob URLs so selected audio files can load native metadata; production script and connect restrictions remain scoped.

**Changed files:**

- Frontend/next.config.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Actual admin file selection displays native metadata Duration: 12s; song upload/create/edit persists, public album/artist discovery includes it, and UI deletion/reload succeeds.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F08: Closed sidebar remains in the accessibility and keyboard trees

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable; discovered during actual local demo validation or source contract review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

The closed sidebar is aria-hidden and inert so offscreen links cannot receive focus.

**Implemented correction or mitigation:**

Frontend: The closed sidebar is aria-hidden and inert so offscreen links cannot receive focus.

**Changed files:**

- Frontend/src/components/layout/AppLayout.tsx
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Root CUA reproduced hidden links remaining reachable. Fresh-image Chromium verifies aria-hidden/inert on the closed sidebar and a Tab action cannot focus any descendant; mobile document width remains within viewport.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F09: Friend request JSON uses the wrong recipient property

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable; actual two-user social workflow reproduced HTTP 400 Invalid account identifier.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Shared friend request client sends targetUserId, matching the canonical User request DTO; every page reuses that client.

**Implemented correction or mitigation:**

Frontend: Shared friend request client sends targetUserId, matching the canonical User request DTO; every page reuses that client.

**Changed files:**

- Frontend/src/lib/api.ts
- Frontend/tests/browser/demo.spec.ts

**Regression tests and verification:**

- Actual two ordinary users send a request, accept it, open a profile chat with correct Identity GUID participants, remove friendship and both pages return to Add Friend. Focused case passed on the rebuilt image.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F10: Failed server logout can silently restore the account after reload

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable; actual browser inspection found logout503 clears local state but leaves a usable server cookie, and the login-page bootstrap could renew that cookie.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

A token-free sign-out intent survives documents and tabs, blocks automatic renewal and retains truthful pending-revocation feedback. Only validated explicit login clears intent. Login/logout/renewal use one bounded origin-wide cookie lock; late logout acknowledgements update only their own intent. Storage denial fails closed, with one persistence retry after cleanup frees quota. Audio and local ownership teardown continue when storage throws.

**Implemented correction or mitigation:**

Frontend: A token-free sign-out intent survives documents and tabs, blocks automatic renewal and retains truthful pending-revocation feedback. Only validated explicit login clears intent. Login/logout/renewal use one bounded origin-wide cookie lock; late logout acknowledgements update only their own intent. Storage denial fails closed, with one persistence retry after cleanup frees quota. Audio and local ownership teardown continue when storage throws.

**Changed files:**

- Frontend/src/lib/session.ts
- Frontend/src/lib/api.ts
- Frontend/src/lib/audio.tsx
- Frontend/src/app/page.tsx
- Frontend/tests/session.test.ts
- Frontend/tests/browser/demo.spec.ts
- Frontend/README.md

**Regression tests and verification:**

- Unit29/29 pass, including failed revoke/reload with zero renewal calls; failed login preserves intent; successful explicit login clears it; readable-but-write-denied storage; all storage methods blocked; quota freed by cleanup; cross-tab intent; delayed logout/login serialization; queued login cancellation; same-intent acknowledgement.
- Actual Chromium focused case2 PASS (7.2s): logout503 leaves original bearer session valid; reload makes zero renewal calls and cannot restore account; failed explicit login retains intent; real retry revokes the server family; explicit successful login clears intent; a second tab waits for delayed real logout before login and survives reload.
- Rebuilt full21 first passed20/failed1 due loading-button test selector (Sign In versus Signing in...), corrected and focused passed; sanitized evidence retained in docs/frontend-browser-discovery-signout.json. App source/image unchanged for that correction.
- Final complete documented run8951 PASS21/21 Chromium workflows (0skip/flaky); frontend29 units/type/lint/format/build/dependency checks passed. See docs/frontend-browser-verification.json.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-O01: CLI status could exit successfully despite failed API readiness.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Discovered during final local startup script review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Propagate failed readiness exit codes and use a bounded one-attempt status probe; retain startup retries.

**Implemented correction or mitigation:**

Frontend: Propagate failed readiness exit codes and use a bounded one-attempt status probe; retain startup retries.

**Changed files:**

- Frontend/demo/Demo.ps1
- Frontend/demo/wait-ready.mjs
- Frontend/demo/demo-api.mjs
- Frontend/demo/outage-restart-integration.mjs

**Regression tests and verification:**

- Final outage command passed26 persisted outage/range/restart checks plus2 actual CLI checks: status exits nonzero with stopped Blob dependency and zero after recovery.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-O02: Interrupted environment generation could report success with missing account credentials.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Discovered during clean-start script review.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Write account credentials before publishing environment and reject existing environments whose account file is missing.

**Implemented correction or mitigation:**

Frontend: Write account credentials before publishing environment and reject existing environments whose account file is missing.

**Changed files:**

- Frontend/demo/New-LocalEnvironment.ps1

**Regression tests and verification:**

- Three disposable-copy scenarios and twelve assertions passed: missing-account failure preserves environment, fresh setup produces one Admin and three Users, rerun preserves both file hashes.

**Remaining limitations:**

No remaining limitation recorded for this finding.

### NEW-F11: Playback regression cleanup reuses revoked credentials and leaks task-created playlists

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: Applicable to the QA fixture lifecycle. Final manual UI review found four exact task-created Playback fixture playlists left by earlier successful browser runs; this was a test cleanup defect, not an app playlist deletion defect.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Case4 obtains a fresh Alice session through the independent Playwright request fixture after browser logout, checks owner identity, asserts deletion204 plus persisted detail404 and owner-list absence, then revokes the cleanup session with asserted logout204. Browser guest/audio teardown assertions remain intact. Focus uses a separate output directory and list reporter to preserve the final full-suite JSON.

**Implemented correction or mitigation:**

Frontend: Case4 obtains a fresh Alice session through the independent Playwright request fixture after browser logout, checks owner identity, asserts deletion204 plus persisted detail404 and owner-list absence, then revokes the cleanup session with asserted logout204. Browser guest/audio teardown assertions remain intact. Focus uses a separate output directory and list reporter to preserve the final full-suite JSON.

**Changed files:**

- Frontend/tests/browser/demo.spec.ts
- Frontend/docs/frontend-browser-verification-playback-cleanup.json

**Regression tests and verification:**

- Changed actual Chromium playback/logout/cleanup case passed1/1:1.8s test,3.7s suite,exit0. Delete204, persisted detail404/list absence and cleanup logout204 are asserted.
- Type check and scoped ESLint passed after the test-only correction; formatting applied.
- SHA256 verifies the original final full21 browser-results JSON remains unchanged.

**Remaining limitations:**

- Historical leaked fixture removal is separately scoped and verified by root; this supplemental proof removes only its own newly created playback fixture.

### NEW-O03: Windows development teardown left a Next child holding the demo port.

**Status:** Fixed and verified

**Origin:** Encountered during task. Conservative combined contributor dispositions.

**Applicability:**

Frontend: The documented frontend development startup worked, but PTY Ctrl+C left its verified child on3100 and the first container restore failed. An empty unelevated listener query did not prove that the port was free.

**Discovery evidence:**

Encountered during task; supporting evidence is recorded by the contributors below.

**Planned correction:**

Provide a scoped Windows fallback that verifies the listener, exact workspace Next dev parent, command paths and process creation times before stopping only the owned child. Inspect all3100 listeners and exclusively bind-probe loopback before claiming the port is free. Retain a bounded lifecycle regression with owned-stop, foreign-denial and no-op checks plus container restoration.

**Implemented correction or mitigation:**

Frontend: Provide a scoped Windows fallback that verifies the listener, exact workspace Next dev parent, command paths and process creation times before stopping only the owned child. Inspect all3100 listeners and exclusively bind-probe loopback before claiming the port is free. Retain a bounded lifecycle regression with owned-stop, foreign-denial and no-op checks plus container restoration.

**Changed files:**

- Frontend/demo/Stop-FrontendDevelopment.ps1
- Frontend/demo/Test-FrontendDevelopment.ps1
- Frontend/demo/verify-development-page.cjs
- Frontend/demo/README.md
- Frontend/docs/local-demo/verification/frontend-development.json

**Regression tests and verification:**

- Final bounded Windows lifecycle regression passed21/21 checks: anonymous rendering and loopback configuration, exact launched-parent identity/time guard, owned child/parent termination, foreign fixture refused and preserved, exclusive-bind free-port no-op, and production frontend plus all three APIs restored. The scoped helper also refused the running Docker frontend without stopping it.

**Remaining limitations:**

- Windows helper intentionally refuses other command shapes or uncertain ownership. Authenticated UI workflows were verified against the production container; development checks cover startup, configuration and lifecycle.
