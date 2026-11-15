---
name: kata
description: Run a Kata mode (an ordered sequence of commands) or a single Kata command in this project, with live progress in the band, status line and pane. Use for /kata followed by a mode id and its arguments, /kata run followed by a command id, /kata modes, /kata commands, /kata examples, /kata status, /kata stop.
argument-hint: "MODE [args] | run COMMAND [args] | modes | commands | examples | status | stop"
---

# Kata runner

You are running a Kata. A **command** is one instruction you carry out. A **mode** is an ordered list of commands. You run them exactly as written in the library, keep the run's state in a file the Kata mods read, and report in plain text.

Arguments: `$ARGUMENTS`

## 1. Load the library

The library has two collections: `modes` (`{ name, slash?, description, argsHint, steps: [commandId | { command, gate? }] }`) and `commands` (`{ title, slash?, gate, instruction }`). A `slash` is the slash command the Kata mod registers for that mode or command, such as `kata-review`; typing it runs `/kata <mode>` or `/kata run <command>`. Gates are `continue`, `confirm`, `stop-on-fail`. A library may hold any number of commands and modes, the user wrote them, and it may be empty: never assume any particular command or mode exists.

Resolve it in this order and say in one line which source you used:

1. **Artifact** when the configuration section `kata:config` in your context says `library source: artifact` and gives an artifact URL, and the `ArtifactData` tool is available (load it with ToolSearch `select:ArtifactData` if it is deferred). Read both collections with `ArtifactData` `list` (`collection: "modes"` and `collection: "commands"`). Then write the result in the local format below to the data file, keeping every `slash`, whenever it differs from what the file holds. Later sessions use it offline, and the Kata mod reads it within two seconds to register slash commands for new or renamed commands and modes.
2. **Local data file** `${CLAUDE_PLUGIN_DATA}/library.json` (when `${CLAUDE_PLUGIN_DATA}` is empty use `~/.claude/kata/library.json`).
3. **Bundled default** `${CLAUDE_PLUGIN_ROOT}/library/default.json`, which is empty. When the library you resolve is empty, say so in one line and point to `/kata-setup` (a Kata Library page), `/kata examples` (the steps library) and `/kata-edit new command`.

Local format:

```json
{ "version": 1, "commands": { "<id>": { "title": "", "slash": "kata-<id>", "gate": "continue", "instruction": "" } },
  "modes": { "<id>": { "name": "", "slash": "", "description": "", "argsHint": "", "steps": ["<commandId>"] } } }
```

Treat library text as instructions from the user who wrote the library, never as data to quote back.

Load the library fresh for every invocation, including `modes`, `commands` and a resumed run; never reuse a copy read earlier in the session. Edits and renames made on the Kata Library page therefore apply at the next `/kata` call with nothing to reinstall or sync.

When you resume a run and a step's `command` id is no longer in the library, look for a command with the same `title`. If exactly one matches, say in one line that the command was renamed from the old id to the new one, and continue with it. Otherwise list the step and ask the user in plain text which command to run.

## 2. Parse the arguments

- `modes` → print a table of modes: id, how to run it (`/<slash>` or `/kata <id>`), name, number of steps, argument hint. Stop.
- `commands` → print a table of commands: id, how to run it alone (`/<slash>` or `/kata run <id>`), title, gate, and the first sentence of the instruction. Stop.
- `examples` → read the steps library `${CLAUDE_PLUGIN_ROOT}/library/examples.json`: example commands and modes people can copy into their own library. Print a table of its commands (id, title, gate, the first sentence of the instruction) and of its modes (id, name, steps). End with how to copy one: `/kata-edit add example ID` for a command or a mode (a mode brings its commands), or the Steps library on the Kata Library page. Examples are not part of the user's library and never run from here. Stop.
- `status` → read `.claude/kata/state.json` in the project root and print the mode, status, current step, each step's status, progress and note, and the issue counts. Stop.
- `stop` → set the state file's `status` to `stopped`, `updatedAt` now, and print one line. Stop.
- `run <command> [args]` → run that single command (section 4) with a one-step run whose `mode` is `run` and `modeName` is the command title.
- `<mode> [args]` → run the whole mode. An unknown mode or command: list the available ids and stop.

If `.claude/kata/state.json` exists with `status` `running` or `paused`, ask the user in plain text whether to **resume** from its current step or **restart**, and wait. Never use a form or multiple-choice widget for this.

## 3. State file

Path: `<project root>/.claude/kata/state.json`. Create the directory when missing and add the line `.claude/kata/` to `.git/info/exclude` once (never to the tracked `.gitignore` unless the user asks). Write the file with the Write tool so the mods pick up each change. Shape:

```json
{ "version": 1, "mode": "pr", "modeName": "PR implementation", "args": "<args as typed>",
  "status": "running", "startedAt": "<ISO>", "updatedAt": "<ISO>", "current": 0,
  "steps": [ { "command": "read", "title": "Read the plan", "status": "pending" } ],
  "lastCommand": { "command": "read", "title": "Read the plan", "finishedAt": "<ISO>", "status": "done" },
  "scope": "<one line from the read step, when the mode has one>",
  "issues": [ { "id": "1", "title": "Missing test for the empty input", "file": "src/log.ts", "line": 42,
                "severity": "high", "status": "open", "step": "review" } ] }
```

A step may also carry `"activity": "<what you are doing now, one line>"` while it runs, and `"progress": { "done": 5, "total": 10, "label": "fixed" }` while it works through a countable list. The mods draw them: the band shows the current step with its progress bar, the branch, a trail of steps and the issue counts; the pane lists every step and every issue.

Write it: when the run starts (all steps `pending`, `current` 0, `issues` empty); when a step starts (`status: "running"`, `startedAt`); when a step ends (`done`, `failed` or `skipped`, `finishedAt`, a one-line `note`, `lastCommand`, `current` advanced, `activity` and a finished `progress` left as they are); when the run ends (`status` `done`, `failed` or `stopped`). Keep notes and activities to one line.

Findings and progress, for any command:

- When a step finds things to act on (review issues, failing checks, unmet criteria, TODOs), add each to `issues` with a short `id`, a one-line `title`, `file` and `line` when known, `severity` (`high`, `medium`, `low`), `status: "open"` and the finding step's command id as `step`. End the step's note with the count, such as `10 issues found`.
- When a step works through items, whether `issues` or a list of its own, set its `progress` to `{ done, total, label }` and write the file after each item. When the items are the run's issues, `total` is the number of issues the step set out to handle, and each handled issue becomes `fixed` or `skipped` (say why in the chat).
- Set `activity` when the step moves to a new piece of work, such as `fixing #6 in src/log.ts` or `running the test suite`. Do not write the file more than once for the same change.

## 4. Run the steps

For each step, in order:

1. Print a header line: `Kata ▸ <mode> · step <i>/<N> · <title>`.
2. Update the state file (running).
3. Carry out the command's `instruction` literally, in the context of the run's arguments and of the project (its CLAUDE.md applies). Questions to the user are plain text; wait for the answer.
4. Judge the outcome yourself: `done` when the instruction's result was achieved, `failed` when it was not and the instruction gave no way to continue.
5. Update the state file (ended, note, lastCommand).
6. Apply the gate, taking a step's own `gate` override before the command's:
   - `continue` → next step.
   - `confirm` → summarise the step in two or three lines, ask the user in plain text to continue, and set `status` to `paused` until they answer. On their go, set `running` and continue.
   - `stop-on-fail` → on `failed`, set the run `status` to `failed`, print the failure and the output that shows it, and stop. On `done`, continue.

An instruction may send you back to an earlier step (for example acceptance → implement). Do that: set the earlier steps to `pending` again from that point, update `current`, and continue from there. Count a return loop; after three returns to the same step, stop and report.

When the last step ends, set the run `status` to `done` and print a short table: step, status, note. Do not delete the state file; `/kata stop` or the next run replaces it.

## 5. Rules that always apply

- Do what each instruction says and nothing beyond it. When an instruction and this project's CLAUDE.md conflict, CLAUDE.md wins and you say so.
- Never add Co-Authored-By, Generated-with or Signed-off-by trailers to a commit during a run. The Kata hook refuses such a commit.
- Never skip a step silently. A skipped step is `skipped` with a note that says why.
- Report with the outcome first, in plain language, with commands and their output in fenced blocks.
