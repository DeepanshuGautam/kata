# Security

Kata runs instructions that a person wrote into a library. That makes the library the trust boundary.

## What the plugin does and does not do

- The hooks module reads one file, `<project>/.claude/kata/state.json`, and writes nothing to disk. It makes no network calls and sends no telemetry.
- The skills read the library from a claude.ai artifact the user configured, from the plugin's data directory, or from the bundled `library/default.json`. They write only the state file, the run journal under `.claude/kata/`, and the local library cache.
- The commit guard refuses `git commit` commands whose message carries attribution trailers while a run is active (or always, per setting). It fails open: if the guard itself errors, the command runs.
- Nothing in this repository holds a secret. Settings come from `userConfig`.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| A shared artifact is edited by someone else and changes what Claude does | Library rules allow writes at `admin` only. Drift protection (0.2) hashes each command in the local cache and asks before running changed text. Keep the artifact private or shared with editors you trust. |
| A library instruction asks for something harmful (skip tests, leak secrets, add trailers) | `/kata-edit` refuses to write such a command. The runner follows the project's CLAUDE.md over a library instruction and says so. Review `/kata commands` before running a library you did not write. |
| The state file is tampered with | It only drives the display and resume. The runner re-reads the library for instructions and never executes text from the state file. |
| A hooks module update changes behaviour | Installed plugins run the committed version; updates arrive through `claude plugin update`. Review the diff of `hooks/register.tsx` between versions. |

## Reporting

Open a GitHub issue marked *security*, or email the maintainer listed in `plugin.json`. Do not include secrets in the report.
