# Changelog

All notable changes to Kata are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Runner flags: `--dry-run` prints the plan and writes nothing; `--from`, `--only` and `--skip` choose the steps by command id or number; `--no-confirm` passes `confirm` gates. With any flag the plan is printed first, and skipped steps are recorded as skipped with the reason.
- `mise run media` renders every README and website picture and video (`docs/media/`) from the current mod and Kata Library page: terminal stills, a GIF and a WebM of a `pr` run, page stills and a GIF tour. It replaces the hand-made snapshots in `docs/images/`.

### Fixed
- `/kata-edit` names every reserved slash name, pins deletes to the version read, and when the page refuses a stale write it re-reads, shows what changed and asks before applying on top.

## [0.1.1] - 2026-11-15

### Changed
- Run state moves to `<project>/.kata/state.json`, which ignores itself in git through `.kata/.gitignore`. Claude Code guards `.claude/` and `.git/` as sensitive, so writing state there asked for permission at every step.
- The local library copy has one path for the skills and the mod: `~/.claude/kata/library.json`, or `$KATA_HOME/library.json` when `KATA_HOME` is set. The skills used to write to the plugin's data folder, which the mod could not see.
- `/kata-sync` lists every difference, one line each (`+` added, `-` removed, `~` changed with the fields), and repeats the list in its final message.
- `/kata-edit add example ID` means the mode when an example mode and command share the id; `add example command ID` copies the command alone.
- The example acceptance command closes a tracked task when the project's CLAUDE.md says to: on acceptance, or on merge (the default).

### Added
- `KATA_HOME` moves the local library, for separate setups and for testing.
- A warning, in the prompt section and from `/kata`, when the library source is the artifact but no URL is set, naming the fallback used.

### Fixed
- The band keeps to one row when Claude Code reports it collapsed (`isCollapsed`, newer engines).
- CI validates the library files with the 2020-12 JSON Schema draft and can be run by hand.

## [0.1.0] - 2026-11-15

First public release.

### Added
- `/kata` runner: run a mode (`/kata MODE [args]`) or one command (`/kata run COMMAND [args]`); `modes`, `commands`, `status`, `stop`; gates `continue`, `confirm`, `stop-on-fail`; resume or restart a run; return loops capped at three.
- Libraries of any size: commands and modes on a claude.ai Kata Library page, in a local file, or the bundled default, resolved in that order and read fresh at every call.
- Slash commands from the library: any command or mode with a `slash` name becomes `/<slash>`. The mod registers new and renamed names within seconds, with no reinstall, and gives a namespaced `/kata:kata` the short name `/kata`.
- Library sync: the mod reads the Kata Library page through Claude Code's ArtifactData tool when a session starts, every ten minutes and on `/kata-refresh`, never prompting for permission, and keeps the local copy current.
- `/kata-setup`: publishes a private Kata Library page and points the plugin at it; `--local` for a file-only library. A new library starts empty.
- `/kata-edit` (create, change, rename, delete) and `/kata-sync` (diff, `--from` import), both checked against `schemas/library.schema.json`.
- Run state with findings and progress for any command: `issues` (severity, file, line, open, fixed or skipped), a step's `progress` (`done/total` with a label) and its `activity`.
- Band above the prompt: mode, branch, current step with a progress bar, a trail of steps, issue counts, elapsed time, and a hide button. A single-row layout when room is short.
- Status line headline with progress and branch.
- Pane (`/kata-panel`): steps with status, duration, progress, activity and notes; issues with severity, location and status; buttons to stop the run, show or hide the band, and refresh the library; the library's modes and commands with their slash commands when no run is active.
- Toasts on run start, step end and run end; native notifications when a run waits for you or ends (`notify` setting).
- Commit-trailer guard (`blockTrailers`: during-kata, always, never), failing open.
- Kata Library page: edit in place, reorder and add or remove steps, create, rename and delete, slash names for commands and modes, export JSON, a Steps library to add examples from, an About view, and a read-only view for people without edit access.
- Steps library (`library/examples.json`, `/kata examples`, `/kata-edit add example`): a pull-request workflow mode and its eight commands (read, implement, review, fix, verify, commit, acceptance, pr) to copy and adapt. The bundled library itself is empty.
- README snapshots of the band and the pane (`docs/images/`).
- Plugin tests for the guard, band, status line, toasts, notifications, pane, library sync and slash commands; plugin icon; CI workflow.

[Unreleased]: https://github.com/DeepanshuGautam/kata/compare/kata--v0.1.1...HEAD
[0.1.1]: https://github.com/DeepanshuGautam/kata/compare/kata--v0.1.0...kata--v0.1.1
[0.1.0]: https://github.com/DeepanshuGautam/kata/releases/tag/kata--v0.1.0
