# Chat and friend-request follow-up

Scope: audit and fix the current Chat and Friend Request systems across Frontend and User, then commit and push the verified changes under the user's existing instruction. The earlier local-demo verification records are historical; this document tracks the new follow-up. Use the existing isolated demo without resetting or reseeding its volumes. Identity and Music require no follow-up source changes.

## Checklist

- [x] Inspect clean repository state and check the existing isolated stack.
- [x] Assign frontend, friendship backend and chat backend ownership.
- [x] Reproduce and document the specific event, transition and history defects.
- [x] Apply focused backend contract and persistence corrections.
- [x] Run real Mongo/HTTP/SignalR integration regressions.
- [x] Finish frontend recovery corrections and rerun unit, type, lint, format and build checks.
- [x] Rebuild the changed containers and verify real two-user browser workflows.
- [x] Record results, root causes and remaining limits.

## Findings and corrections

The baseline browser runs reproduced two defects with disposable ordinary users: outgoing requests had no cancel control, and an already fetched initial history response replaced a subsequently received live message. Final-review browser reproductions confirmed a long offline interval restored only 50 of 80 messages, and an accepted friend still had an enabled Add action in retained search results. Assertions and cleanup outcomes are recorded in `chat-friend-discovery.json`.

### Friend requests

- Frontend consumers expected different request/removal field names than the server published. Independent canonical subscriptions now update every consumer; one consumer no longer replaces another or disconnects the shared hub on unmount.
- The UI omitted outgoing requests and relied on self-delivered events for successful mutations. The owner-only sent-request endpoint and immediate local transitions support send, cancel, accept, decline and remove, while events reconcile both users. Accepted retained search results cannot offer Add again.
- Reusing one database row's ID across request attempts allowed an old action to target a new request. Public `RequestId` rotates on each attempt, with a unique sparse index; legacy internal IDs remain valid until that request's next attempt.
- Cancellation racing with acceptance could remove the newly accepted relationship. `pendingOnly=true` is a sender-only cancellation precondition; atomic status transitions retain one canonical pair and reject duplicates, crossed pending requests, self requests and unauthorized actors. Accepted friendship removal remains available to either participant.
- Relationship changes and their notification updates now share the Mongo transaction. Cancel/decline/accept resolve the matching actionable notification, with request-specific keys preventing stale attempts from affecting a new notice.
- Profile snapshots must preserve the last known relationship on a failed fetch, retry after stale mutation errors, and refresh after reconnect. Target/version guards prevent an older response from updating a different profile.

### Chat

- Late REST history replaced realtime messages; paging by offset could skip or repeat messages during new writes. History, events and acknowledgements now merge by message ID in timestamp/ID order, with a stable `before` cursor and an older-history control. Reconnect pages back to a retained continuity boundary to recover multiple pages of missed arrivals. Live and acknowledged tails remain buffered until recovery; a further disconnect invalidates pending responses while retaining the earliest missing-history boundary. Reads wait for contiguous recovery. A 20-page cap exposes a retry that reloads a contiguous latest window with working older pagination, preserving the draft.
- Replaying a message nonce could move the preview backwards and publish duplicate events. Only inserted writes change last-message/activity projections or publish notices/events. UUID variants normalize to one operation; altered content with the same nonce conflicts. Frontend failed attempts retain their nonce per chat and content, including a route switch and another chat's send.
- Bulk read receipts were missing from the UI, and room-only publication missed senders outside that room. Receipts reach participant personal groups on both hubs. Snapshot cutoffs update only messages actually displayed and matching notifications; the frontend watermark remains monotonic despite reordered receipts. A hidden document retries its bounded read when visible.
- Participant normalization and creation races could authorize a write from stale privacy or relationship snapshots. Real Mongo writes serialize creation against profile deletion, privacy changes and friendship removal; membership and canonical room keys are checked consistently.
- A publication failure after commit could report a failed command although the database write succeeded. Publication is bounded and independent; persistence errors roll back, while committed commands retain their successful acknowledgement. Reconnect/history reads recover persisted data.

## Contracts and compatibility

- Incoming/outgoing request DTOs and events use canonical identity GUIDs; the database retains profile ObjectIds internally. Legacy ObjectId read aliases remain supported.
- New attempts have a fresh 24-character public request ID. Cancelled and removed pairs appear as `none` in the status API; declined remains `declined`. Acceptance timestamps are reserved for accepted requests.
- `GET /api/chats/{chatId}/messages?before={messageId}&pageSize=50` returns a stable newest-first page. The cursor must belong to that chat. Existing offset callers remain supported; mixing a cursor with an offset other than page 1 is rejected.
- `MarkMessagesReadThrough(chatId, messageId)` and the optional REST cutoff preserve snapshot semantics. Existing one-argument/empty-body calls remain compatible.
- Existing direct-chat membership survives removing a friendship, including private participants; creating a new chat with a private user requires the authorized relationship.
- Persisted indicators are **Sent** and **Read**. The system has no durable delivered acknowledgement, so no Delivered state is fabricated.

## Reproducing verification

With the existing isolated demo provisioned and ready, run from the workspace root:

```powershell
dotnet restore User/tests/User.Tests/User.Tests.csproj --locked-mode
pwsh -NoProfile -File Frontend/demo/Test-ChatFriends.ps1
```

The script reads ignored local demo settings in memory, restores the caller's environment afterward, and keeps raw TRX output under ignored `demo/results-chat-friends`. It runs all User tests; an optional `-Filter 'FullyQualifiedName~ChatRegressionTests|FullyQualifiedName~FriendRequestRegressionTests'` selects the focused regressions.

From `Frontend`, use `npm.cmd run type-check`, `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd test`, and the production build with the demo's three explicit public API URLs. Browser commands are:

```powershell
npx.cmd playwright test tests/browser/chat-friends.spec.ts --reporter=list --output=demo/results-chat-friends-fixed
npx.cmd playwright test --reporter=list --output=demo/results-chat-friends-full-browser
```

These report/output overrides preserve the earlier browser verification record. The new browser cases provision ordinary users in independent sessions and assert deletion of exactly their disposable chats/accounts. No database reset or reseed is used.

Backend verification: **43 passed, 0 failed, 0 skipped**, including **10 Chat** and **14 Friend Request** regression cases using real Mongo transactions, HTTP middleware and SignalR clients. The reusable test script was also executed successfully with the same totals.

Frontend verification: **65/65 unit tests** in 11 files; type-check, zero-warning ESLint, full Prettier and explicit-loopback production build all passed. Focused reviews confirmed the frontend/backend friendship contracts and repeated reconnect/receipt ordering. Both changed Docker images built successfully and the final stack passed readiness checks.

The broad browser run passed **23/23**, with no skips, unexpected failures or flaky cases. This run preceded the final profile response guard and reconnect ordering/epoch safeguards. The four affected workflows were rerun on the final image and passed **4/4**, again with no skips or flaky cases: the full live friend-request lifecycle, delayed/older history plus an 80-message reconnect gap, accepted private-friend visibility/chat access, and ordinary-user profile follow/friendship/chat transitions. Unit regressions additionally force a live message before Join, hold recovery history, disconnect a second time, and verify full recovery before a single bounded read acknowledgement. The earlier 21-case browser report remains unchanged.

Sanitized totals and commands are in `chat-friend-verification.json`. The final Friends view is in `chat-friend-ui.png`. Git commit IDs and remote confirmation are reported separately with the task result.

## Limits

Verification uses the local isolated Mongo replica set, single-instance User service, real SignalR clients and Chromium. Multi-instance deployment and external network conditions are outside this local proof. Historical broad audit counts remain unchanged in their original records.
