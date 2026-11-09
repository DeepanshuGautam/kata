# Kata

Practised sequences for Claude Code. A **command** is one instruction Claude follows. A **mode** is an ordered list of commands. Run a whole mode or one command from the terminal, keep the library in a claude.ai page or a local file, and watch the run in a band above the prompt, the status line and a pane.

Ships with three modes built from twelve commands:

- **pr**: read the plan → implement → full self-review → fix everything → lint, tests and architecture check → commit without trailers → acceptance criteria → open an itemised pull request.
- **hotfix**: read → implement → verify → commit → pr, for urgent small fixes.
- **release**: changelog → version bump (pauses for confirmation) → commit → tag → release notes.

A command is written once and any mode can list it. Rename a command or mode on the Kata Library page and the modes that use it follow; `/kata` reads the page at every run, so nothing needs reinstalling.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install kata --marketplace DeepanshuGautam/kata
```

Answer `y` to add the marketplace, then pick a scope. From a shell: `claude plugin install kata --marketplace DeepanshuGautam/kata`.

On claude.ai or the Claude desktop app: Customize → Plugins → Add → **Add marketplace** → `DeepanshuGautam/kata`, then add **Kata**. The plugin then syncs into your Claude Code sessions signed in with the same account.

## Use

```
/kata modes                       list modes
/kata commands                    list commands
/kata pr "1.0 PR 3 Logging package"   run the pr mode for that scope
/kata run review                  run one command on its own
/kata status                      where the current run is
/kata stop                        end the current run
/kata-panel                       open the Kata pane
/kata-sync                        pull the library from the artifact into the local file
/kata-edit new command write-docs create a command from the terminal
```

Each step is announced as `Kata ▸ pr · step 3/8 · Full self-review`. Progress lives in `.claude/kata/state.json` in the project (excluded from git), which the mods read for the band, status line and pane.

## Where the library lives

- **Artifact** (default): a private claude.ai page, *Kata Library*, with the `db` capability. Edit commands and modes there, reorder steps, export JSON. Set its URL in `/config` → kata → *Kata Library artifact URL*. Sessions that cannot reach it fall back to the local file.
- **Local**: `${CLAUDE_PLUGIN_DATA}/library.json`. Set *Library source* to `local` in `/config`, then use `/kata-edit` or edit the JSON. `/kata-sync --from <file>` imports a JSON exported from the page.
- **Bundled**: `library/default.json` holds the `pr` mode and is used when nothing else is found.

Gates on a command: `continue`, `confirm` (pause and ask before the next step), `stop-on-fail`.

## Mods

- **Band** above the prompt while a run is active: `⛩ kata pr · 3/8 Full self-review  ✓ ✓ ▶ · · · · ·  last: implement 12:04  [hide]`.
- **Status line** with the same headline.
- **Pane** (`/kata-panel`): every step with its status and note, the last command, the scope.
- **Commit guard**: a `git commit` whose message carries `Co-Authored-By`, `Generated with` or `Signed-off-by` is refused during a run (configurable: during-kata, always, never).

## Settings (`/config` → kata)

| Setting | Default | Meaning |
|---|---|---|
| Library source | artifact | `artifact` or `local` |
| Kata Library artifact URL | empty | the claude.ai page holding commands and modes |
| Block commit trailers | during-kata | `during-kata`, `always`, `never` |
| Show the run band | on | band above the prompt during a run |

## Make your own Kata Library page

Ask Claude in a claude.ai-connected session: "Publish a Kata Library artifact for the kata plugin" and paste the URL into the setting. The page needs the `db` and `user` capabilities with `write: admin` on the root, two collections `modes` and `commands`, and the document shapes in `library/default.json`.

## Roadmap

- **0.1** runner, gates, library sources, mods, Kata Library page, `pr` mode.
- **0.2** flags (`--dry-run`, `--from`, `--only`, `--skip`, `--no-confirm`), templating and `params`, mode-as-step and `when` conditions, run journal and `/kata history`, `/kata doctor`, drift protection for shared libraries, project-local overrides, pane Stop button, native notifications.
- **0.3** eval suite, CI and release workflows, ADRs, `release` mode, directory listing.

## License

MIT
