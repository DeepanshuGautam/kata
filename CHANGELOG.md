# Changelog

All notable changes to Kata are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/DeepanshuGautam/kata/compare/kata--v0.1.0...HEAD
[0.1.0]: https://github.com/DeepanshuGautam/kata/releases/tag/kata--v0.1.0
