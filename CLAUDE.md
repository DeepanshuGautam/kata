# Kata — Claude Code plugin

Kata lets a user define **commands** (single instructions Claude follows), chain them into **modes** (ordered sequences), run a whole mode or one command from the terminal, and watch the run through mods (band above the prompt, status line, pane). The library of commands and modes lives in a claude.ai artifact (the *Kata Library* page, `artifact/kata-library.html`) or in a local JSON file; `library/default.json` is the bundled fallback with the `pr` mode.

The design and task list are in the Obsidian vault GautamSystems: area **Kata**, project **Kata 0.1 — Plugin, library and mods**, note **Kata Implementation Plan** (`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/GautamSystems/Databases/Others/Notes/`). Read the plan first; mark a vault task Done when its work is merged.

## Layout

- `.claude-plugin/plugin.json` manifest, `userConfig` (source, artifactUrl, blockTrailers, showBand); `marketplace.json` makes this repo its own marketplace (`kata-dojo`).
- `skills/kata/SKILL.md` runner (`/kata <mode> [args]`, `run <command>`, `modes`, `commands`, `status`, `stop`); `skills/kata-sync`, `skills/kata-edit`.
- `hooks/hooks.json` + `hooks/register.tsx` the mod: state-file mirror, commit-trailer guard, `kata:config` prompt section, band, pane, `/kata-panel`.
- `types/index.d.ts` the `$.state` contract (`kata.run`, `kata.isBandHidden`).
- `library/default.json` bundled commands and the `pr` mode. `artifact/` the Kata Library page and the seed documents (`commands/*.json`, `modes/pr.json`) for its `db`.
- Run state: `<project>/.claude/kata/state.json`, written by the skill, read by the mod. Never committed.

## Rules

- Load the `plugin-authoring` skill before touching `hooks/register.tsx` or `types/`; the engine API is in the types it lays down, not in memory. `refresh` and any function that receives `$` must be a top-level function declaration.
- `claude plugin validate .` must pass before a commit. Type-check with `tsc -p .` once `.claude-plugin/types/` exists (the engine writes it when the plugin loads).
- Tests are `hooks/*.test.tsx`, run with `claude plugin test .`.
- Skill text is written for Claude in the second person, one procedure per section, plain text questions to the user (never AskUserQuestion), state file updates at every step boundary.
- Commits: Conventional Commits, no trailers of any kind.
- Nothing is published (GitHub, marketplace, directory) until the vault project's test tasks are Done and the user says so.
- Secrets: none in this repo. The plugin reads settings through `userConfig`.

## Try it

```
claude --plugin-dir ~/development/kata          # in a sandbox repo
/kata modes · /kata run review · /kata pr "toy change" · /kata-panel
```
