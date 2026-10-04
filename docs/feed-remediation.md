# Feed audit and remediation

This audit covers the Frontend and User feed paths and their Identity/Music dependencies. Identity and Music remain the authorities for sessions, accounts and playable catalogue songs. Their feed-facing contracts did not require a service rewrite.

## Existing product behavior retained

The authenticated discovery feed includes other public profiles, irrespective of friendship or following. It excludes the viewer and private authors. A direct post remains readable by its public audience, its own private author, or an administrator; friendship and following do not grant access to private listening activity.

The five existing card types remain live playback, recent songs, weekly top artists, weekly top songs and artists shared with the viewer. The server traverses live playback, recent songs and then each author's weekly/comparison cards. The frontend retains its 72-hour unseen priority, shuffle in groups of four, author declumping and vertical snap navigation. Weekly rankings remain the three highest listening counts, with deterministic ties; weeks start Sunday at midnight UTC.

Recent-song posts retain the existing stable author/song identity and historical catalogue snapshot. Listening history still expires after 90 days. Deleting a catalogue song does not remove historical activity under the existing policy; the frontend must report unavailable playback rather than pretend a missing track can play. No new eligibility, grouping, recommendation or retention rule was introduced.

## End-to-end flow

The audio provider submits canonical listening-history and live-playback requests. User validates the current actor and obtains song metadata from Music. History persistence and recent-post upserts run together in a Mongo transaction. Weekly cards derive from listening history; live playback is ephemeral, bounded local memory with its existing TTL. Refresh obtains a new feed horizon; continuation uses a viewer-bound protected cursor. Mongo reads within a page share a snapshot, so public-profile selection and content aggregation describe one observation.

The client owns feed state for one session generation and refresh epoch. It merges canonical post identifiers, enriches songs/profiles, reads authoritative reaction summaries and stores seen timestamps per account. Reaction toggles remain toggles: the action acknowledgement and a follow-up read confirm their state. An uncertain response requires reloading reactions before another toggle. Reaction people are paginated separately from totals and the viewer's own emojis.

## Root causes

- `skip / 4` approximated author offsets even though authors produce differing numbers of cards. A final `Take(limit)` discarded content, sparse author windows looked like exhaustion, and timestamp ties had no post-ID order.
- The ordinary `/feed` path ran deep-link fallback without a target, issued overlapping loads from stale offsets and cleared or replaced useful content after failures.
- Feed ownership was captured once. Delayed load/enrichment/reaction completions could cross logout or account changes.
- Standalone live songs were omitted from song enrichment, leaving their Play controls inert.
- Reaction read failures became empty arrays; stale reads could overwrite optimistic state, and counts/my-state silently stopped at 100 reactions.
- Nested card component definitions remounted on parent changes, disrupting dialogs and focus. Active-card observation considered changed entries without preserving the other cards' visibility.
- Weekly song grouping included metadata, splitting renamed copies of one song; comma-delimited artist text split real comma-containing artist names.
- Detail reads accepted empty or non-Sunday derived posts that reaction validation rejected. Separate profile/history reads also allowed privacy changes to produce a mixed observation.
- Late live-playback catalogue responses could resurrect state cleared by a newer pause/track request.
- A wall-clock timestamp could not safely fence cache publication against profile authorization: equal or regressing timestamps admitted later cache writes into an earlier observation. Publication versions now advance only when a reserved write succeeds; cursors also bind to the cache instance.
- Equal-millisecond listening events and delayed writes could move an author's stable recent-song post backwards. History still records every event, while the post updates only for the latest `(PlayedAt, history ID)`.
- Live and recent cards can resolve to the same persisted reaction target. Their pending mutations and uncertain responses now share the canonical target guard and readback.
- Live cards omitted the existing reaction-count dialog entry point. Deep-link navigation scrolled the outer document, and the feed header exceeded the available viewport height.
- Catalogue entries can exist before their audio is uploaded. Their Play controls were enabled, and switching an active player to blank media could leave playback and its heartbeat active. Feed/detail controls now show unavailable playback; the shared player stops, reports its existing playback error and avoids invalid history/heartbeat writes.

## Verification

The frontend baseline reproduced five defects against unchanged application source: unsolicited page loads, missing live-song enrichment, mutations after failed reaction reads, dialog remounts, and a prior-session response rendered after logout. Against the original production demo, a `limit=3` offset walk repeated 12 cards and missed four cards present in the larger query before stopping at an empty page.

Final frontend verification passed 164/164 unit tests across 15 files, type checking, lint with zero warnings, formatting and the production build. Coverage includes 38 feed tests, 16 single-post tests and eight audio reducer/provider tests. The User backend passed 96/96 tests with no skips against disposable Mongo databases, including 22 added feed cases. A saturated fixture returns all 250 timestamp-tied recent posts and all 36 derived cards for 12 authors without missing or duplicating unchanged eligible content.

The final production browser run passed all four feed scenarios: existing card types and reaction persistence on desktop/mobile; a single initial load with failed continuation/retry; canonical live-to-history reactions; and real notification destinations. Related browser checks passed native playback beyond its TTL followed by pause clearing live state, 105-entry listening-history pagination, the complete friend-request lifecycle, and chat recovery after a long reconnect gap. The final authenticated API walk returned ten unique canonical posts, all five existing types for the exact test author, no viewer posts, and finite exhaustion.

Manual desktop/mobile verification confirmed real playback, synchronized live/recent reaction counts, dialog Escape/focus return, refresh visibility, logout clearing the feed/player and a 390px layout without horizontal overflow. Reaction buttons and the summary trigger measure 44×44px on mobile. [Desktop proof](feed-verification-desktop.jpg) was captured on the functional build; [mobile proof](feed-verification-mobile.jpg) includes the final summary-target width correction.

Earlier failures are retained in the [verification record](feed-verification.json). Three fixed-clock privacy regressions failed before the publication fence correction. Initial browser checks exposed the missing live reaction dialog, then two existing tests needed explicit visible-card navigation/exact post identity instead of assuming the first shuffled card. Backend runs during image-build load timed out waiting for disposable index initialization; the final isolated rerun passed all 96 tests. The test harness now waits for the entire production initializer's readiness flag rather than one early index.

Browser scenarios use independent ordinary accounts and remove only their exact fixture identities. Both root QA accounts and the four exact accounts recovered from timed-out reports were confirmed absent through Identity/User reads. Feed test teardown has a separate timeout and idempotent exact-ID cleanup. Local volumes and seeded accounts remain intact. Existing historical chat, friendship and notification reports remain unchanged; the original browser report retains SHA-256 `51d67898a03d79f33063f09b1e8203fd58456d7ab2232641d01a560b8ffa47b2`. Raw new reports and credentials stay ignored locally; the verification record contains counts and hashes.

## Operational limits

A continuation describes a best-effort timestamp/author horizon with one Mongo snapshot per page; it does not hold a database snapshot open across requests. Refresh picks up new activity. Deleted, newly private, expired or updated sources may disappear between pages, and a delayed pre-horizon write can become visible later. Stable keyset positions prevent offset shifts for unchanged eligible content; latest-event checks prevent older listening writes from moving a stable post backwards. A restart or expired continuation requires refresh. Live state retains its existing single-instance in-memory lifetime; this work does not introduce a distributed realtime feed service.

Old history without structured artist names retains its comma-split fallback. New history records exact canonical artist names; historical ambiguous strings cannot be reconstructed reliably without a separate catalogue-backed migration.
