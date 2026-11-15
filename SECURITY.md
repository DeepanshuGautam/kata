# Security

Kata runs instructions that a person wrote into a library. That makes the library the trust boundary.

## What the plugin does and does not do

- The hooks module reads the run state file `<project>/.kata/state.json` and the library (the local copy `~/.claude/kata/library.json`, else the bundled default). It writes one file, that local library copy.
- It makes no network calls of its own and sends no telemetry. When a Kata Library URL is configured, it reads the page through Claude Code's own `ArtifactData` tool, and only when the session's permission rules allow that call without asking. It never opens a permission prompt for it.
- It runs `git branch --show-current` (and `git rev-parse --short HEAD` on a detached head) in the project to show the branch. Claude Code runs git with repository hooks off.
- It sends native notifications through the person's own notification channel when a run waits or ends, and the `notify` setting turns that off.
- The skills read the library from a claude.ai artifact the user configured, from the plugin's data directory, or from the bundled `library/default.json`, which is empty. The steps library (`library/examples.json`) is only read when the user asks to browse or copy an example. They write only the run state file `<project>/.kata/state.json` and the local library copy.
- The commit guard refuses `git commit` commands whose message carries attribution trailers while a run is active (or always, per setting). It fails open: if the guard itself errors, the command runs.
- Nothing in this repository holds a secret. Settings come from `userConfig`.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| A shared artifact is edited by someone else and changes what Claude does | Library rules allow writes at `admin` only. Drift protection (0.2) hashes each command in the local cache and asks before running changed text. Keep the artifact private or shared with editors you trust. |
| A library instruction asks for something harmful (skip tests, leak secrets, add trailers) | `/kata-edit` refuses to write such a command. The runner follows the project's CLAUDE.md over a library instruction and says so. Review `/kata commands` before running a library you did not write. |
| A library's slash names shadow other commands | The mod registers only names that are lowercase, unique and not Kata's own; Claude Code refuses built-in names. A slash command only runs `/kata` with that command's or mode's id. |
| The state file is tampered with | It only drives the display and resume. The runner re-reads the library for instructions and never executes text from the state file. |
| A hooks module update changes behaviour | Installed plugins run the committed version; updates arrive through `claude plugin update`. Review the diff of `hooks/register.tsx` between versions. |

## Reporting

Open a GitHub issue marked *security*, or email the maintainer listed in `plugin.json`. Do not include secrets in the report.
