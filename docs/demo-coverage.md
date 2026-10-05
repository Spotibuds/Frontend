# Spotibuds demo coverage plan

This plan groups the app's working functionality into complete user tasks. The short overview introduces the product; five focused videos provide a deeper view without requiring viewers to watch one long recording.

## Recording sequence

| Video                              | Initial duration target | Coverage                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview                           | 60–90 seconds           | Discovery, audible playback, collections, feed reactions, friendship, two-session chat and mobile web                                                                                                                                                                                                                                                                                      |
| 1. Discover and listen             | 2–4 minutes             | Home, browse tabs and paging, search songs/albums/artists/users, empty search, artist and album pages, play/pause, seek, next/previous, shuffle, repeat, volume/mute, expanded player, queue add/play/remove/clear and player navigation                                                                                                                                                   |
| 2. Favorites and playlists         | 2–4 minutes             | Favorite add/remove and persistence, library filter, playlist creation and validation, metadata editing, public/private visibility, cover upload/remove, add song/album, ordered playback, reorder/remove tracks and deletion of a newly created demonstration playlist                                                                                                                    |
| 3. Feed and listening profiles     | 2–4 minutes             | Recent listening, now playing, weekly artists, weekly songs and common-artist cards where available, previous/next/keyboard navigation, refresh, playback, relative times, reaction add/remove/counts/people, artist/album/profile links, post detail links, follow/unfollow, recent listening, weekly artists, reactions, friends/public playlist dialogs and history month filter/replay |
| 4. Friends, chat and notifications | 2–4 minutes             | People search, request/cancel/decline/accept, friend removal using a newly created demonstration relationship, profile messaging, independent desktop/mobile sessions, sends and read receipts, history after reload, notification dropdown/page, destination links, mark read, individual dismissal and bulk controls on demonstration-only notifications                                 |
| 5. Accounts and administration     | 2–4 minutes             | Registration validation and sign-in, logout/login, display name/bio/avatar upload/remove, profile privacy, recovery's deployed limitation, invalid reset-link handling, admin albums/artists/songs/users/admins pages, catalogue search/paging, editor validation and file controls, canceled deletion and account role dialogs                                                            |

## Presentation rules

- Actual deployed application, APIs and existing music. Capture playback audio from the browser; pauses, mute and seeks must correspond to the recording.
- Desktop and mobile web footage, with readable controls and a restrained pointer highlight. Pair desktop/mobile chat views where it clarifies the interaction.
- Short scene captions, downloadable captions and chapter timestamps. Music is audible during listening demonstrations; no unrelated music is added beneath silent screens.
- Show an action and its visible result. Include persistence checks and a few relevant empty/validation states. Do not simulate a working capability that is unavailable.
- Do not create catalogue songs, artists or albums for recording. Catalogue creation/editing/deletion controls are previews without saving changes to existing music.
- Preserve all pre-existing data. Remove only disposable records or relationships created during these recordings. Use synthetic accounts, redact sensitive administrative account fields and exclude credentials/raw audio downloads from Git.
- Record unsupported or unavailable features in the final coverage record rather than hiding them. Recovery email is currently unavailable; notification/history pagination is demonstrated only where sufficient existing records exist.

## Publication

The project README and organization homepage lead with a product description, screenshot, overview and focused demo links. Architecture, repository links, local setup and verification follow. Project documentation stays focused on functionality and implementation. The [browser video gallery](https://spotibuds.github.io/.github/) plays the recordings with sound, English captions and chapter navigation without an account or download. GitHub Pages hosts it independently of the app server. Its deployment fetches and verifies the pinned GitHub release videos; large video files remain outside Git history. Drive holds a backup copy.

## Research informing the format

GitHub describes READMEs as the place to explain what a project does, why it is useful and how to get started. [GitHub README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

Wistia's first-party viewing data distinguishes short introductions from deeper product demonstrations and suggests placing the strongest material early. The five workflow grouping is a project-specific editorial decision. [Wistia video-length guidance](https://wistia.com/blog/optimal-video-length)

GitHub organization homepages support a public `.github` repository containing `profile/README.md`. [Organization profile documentation](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile)

## Published recordings

| Video                                                                           | Length | Workflows                                                                                                 |
| ------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| [Overview](https://spotibuds.github.io/.github/#overview)                       | 1:16   | Audible listening, reactions, collections and independent desktop/mobile chat                             |
| [Discover and listen](https://spotibuds.github.io/.github/#discover)            | 1:54   | Home, catalogue paging, music/people search, playback, queue, album/artist links and mobile navigation    |
| [Favorites and playlists](https://spotibuds.github.io/.github/#favorites)       | 0:57   | Favorites, creation, covers, visibility, album/song additions, order, persistence and disposable deletion |
| [Feed and listening profiles](https://spotibuds.github.io/.github/#feed)        | 1:42   | All five feed cards, navigation, playback, reactions, profiles, post links and listening history          |
| [Friends, chat and notifications](https://spotibuds.github.io/.github/#friends) | 1:24   | Request/cancel/decline/accept, profile messaging, delivery, receipts, saved chats and inbox actions       |
| [Accounts and administration](https://spotibuds.github.io/.github/#accounts)    | 1:46   | Registration, profile/avatar/privacy, sign-in/out, recovery limits and administration previews            |

The final edits contain 153 coverage entries. Lengths follow the recorded tasks rather than padding to the initial targets. [Timestamped action index](demo-coverage.json) records what is shown and the deployed limitations. Captions and precise chapters are included in the [release](https://github.com/Spotibuds/Frontend/releases/tag/demo-suite-2026-10-05).
