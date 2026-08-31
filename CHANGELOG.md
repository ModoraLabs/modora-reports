# Changelog

All notable changes to modora-admin are documented here.

## [2.0.8] - 2026-08-31

### Fixed

- **Spectate had no way out:** entering spectate made the staff member's ped invisible, frozen, and collisionless, and nothing anywhere reversed it — the on-screen "Use /mstaff to stop" hint did nothing, leaving staff stuck invisible and falling through the map when they teleported away. Spectate now tracks its own state and exits cleanly — restoring visibility, collision, and freeze and returning you to where you started — via Backspace, `/unspectate`, or `/mstaff`, with an `onResourceStop` safety net.
- **Spectate didn't follow the target:** the camera used a one-time snapshot of the target's position, so the moment they walked away you were watching empty ground. Spectate now follows the target's live position (including into vehicles) using the target id the server already sends, and auto-stops if the spectated player disconnects.
- **Spectate camera framing:** you were placed 10 m directly above the target and had to look straight down. Spectate now uses an adjustable scripted orbit camera positioned behind and above the target — mouse to rotate, scroll wheel to zoom.

## [2.0.7] - 2026-08-27

### Fixed

- **Severity was always stored as "medium":** the report form mapped the picked severity onto a ticket priority and put the original in `meta.severity`, but the client dropped `meta` before handing the report to the server, so the API never saw a severity and fell back to guessing one from the category (which defaults to `medium`). The report payload now carries `severity` as its own field and forwards `meta` unchanged.
- **`/reportstatus` "My Reports" showed no id:** since 2.0.6 the card header only rendered the Discord channel name, which the API returns as `null` once a ticket is resolved or closed, so those cards had no identifier at all. Cards now always show `#<ticket number>` (falling back to the report id), with the live channel name next to it while the ticket is open, and the expanded view lists the report id and severity.

## [2.0.6] - 2026-07-12

### Fixed

- **`/reportstatus` "My Reports":** report cards showed `#undefined` as the channel name for every report. The NUI read camelCase keys (`report.channelName`, `report.category`) while the API returns snake_case (`channel_name`, `category_label`). It now reads the snake_case fields (with camelCase fallbacks), only renders the channel line while the Discord ticket is still live, and shows the resolved category label instead of the raw category id.

## [2.0.5] - 2026-07-02

### Fixed

- **Release packaging:** the release zip did not include the `shared/` folder, so servers running a downloaded release logged `could not find shared_script shared/constants.lua` (and `shared/locales/en.lua`, `shared/locales/nl.lua`) and lost shared constants/translations. The release workflow now packages `shared/`. Re-download this release to resolve the warnings.

## [2.0.4] - 2026-07-02

### Fixed

- **`/reportstatus`:** the server-side status poll only accepted HTTP `200` and used a non-retrying request, so report statuses were silently dropped when the API responded with a `302` (e.g. behind a reverse proxy that returns the JSON body with a redirect). It now uses the resilient request path, accepts both `200` and `302`, and always updates the client.
- **Update/version check:** the resource checked for new versions against a stale GitLab project, so updates were never detected correctly. It now queries the GitHub Releases API (`ModoraLabs/modora-admin`), where releases are actually published.

## [2.0.2] - 2026-04-22

### Fixed

- **Report keybind:** `Config.ReportKeybind` set to `false` (or string `'false'`, `nil`, empty string) no longer registers a broken key mapping in FiveM's keybind settings. Previously the string `'false'` was passed through to `RegisterKeyMapping`, causing a dead entry to persist in `citizen/settings.xml`.

### Changed

- Default `Config.ReportKeybind` is now the boolean `false` instead of the string `'false'`. Both remain accepted as "disabled"; valid key names (e.g. `'F7'`) continue to work.

---

## [1.1.0] - 2026-03-10

### Added

- **Heartbeat:** Periodic `GET /stats` to the Modora API so the dashboard shows the server as online. Configure `Config.HeartbeatIntervalSeconds` (default 120). Set to 0 to disable.
- **Moderation Bridge (Discord → Game):** Polls `GET /moderation/pending` for kick/ban/warn actions created from Discord (`/fivem kick`, `/fivem ban`, `/fivem warn`). Executes them in-game and reports back via `POST /moderation/executed`. Configure `Config.ModerationPollIntervalSeconds` (default 30). Set to 0 to disable.
- **In-game warn:** When staff use `/fivem warn` in Discord, the target player receives an orange chat message with the reason.

### Changed

- Description updated to "Modora FiveM Bridge - Reports, heartbeat, moderation sync (kick/ban/warn from Discord)".

---

## [1.09] - (previous)

- Reports, server stats panel, screenshot upload, TXAdmin/ACE permissions.
