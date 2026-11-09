# Changelog

All notable changes to Kata are recorded here. The format follows Keep a Changelog; versions follow Semantic Versioning.

## [Unreleased]

### Added
- `/kata` runner: modes, single commands, `modes`, `commands`, `status`, `stop`; state file contract; gates `continue`, `confirm`, `stop-on-fail`.
- `/kata-sync` and `/kata-edit` skills.
- Mod: band above the prompt, status line, `/kata-panel` pane, run toasts, commit-trailer guard, `kata:config` prompt section.
- Bundled `pr` mode with eight commands; Kata Library artifact page and seed documents; JSON Schema for the library format.
- Plugin tests (`hooks/kata.test.tsx`): commit guard per `blockTrailers` policy, band shown, hidden and restored, pane steps, `/kata-panel`, `kata:config` section, run start and end toasts.
- Plugin icon at `.claude-plugin/icon.png`; `tsconfig.json` for `tsc -p .` against the engine types.

- `slash` property on a command: the mod registers it as a slash command (`/kata-review` and so on) that runs that one command through `/kata run`, re-reading the library cache every two seconds so a changed name needs no reinstall. The Kata Library page edits it; the schema, skills and seeds carry it.
- Rename on the Kata Library page: changes a command's or mode's id and repoints every mode that lists the command.
- The runner loads the library fresh at every invocation and follows a command renamed during a paused run by its title.

### Fixed
- The `fix` command used the gate `ask`, which the schema does not allow; it is now `confirm`.
- The `isActive` type guard narrowed a finished run to `never`, so the end-of-run toast did not type-check.
