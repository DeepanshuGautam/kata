---
name: kata
description: Run a Kata mode (an ordered sequence of commands) or a single Kata command in this project, with live progress in the band, status line and pane. Use for /kata <mode> [args], /kata run <command> [args], /kata modes, /kata commands, /kata status, /kata stop.
argument-hint: "<mode> [args] | run <command> [args] | modes | commands | status | stop"
---

# Kata runner

You are running a Kata. A **command** is one instruction you carry out. A **mode** is an ordered list of commands. You run them exactly as written in the library, keep the run's state in a file the Kata mods read, and report in plain text.

Arguments: `$ARGUMENTS`

## 1. Load the library

The library has two collections: `modes` (`{ name, description, argsHint, steps: [commandId | { command, gate? }] }`) and `commands` (`{ title, gate, instruction }`). Gates are `continue`, `confirm`, `stop-on-fail`.

Resolve it in this order and say in one line which source you used:

1. **Artifact** when the configuration section `kata:config` in your context says `library source: artifact` and gives an artifact URL, and the `ArtifactData` tool is available (load it with ToolSearch `select:ArtifactData` if it is deferred). Read both collections with `ArtifactData` `list` (`collection: "modes"` and `collection: "commands"`). Then write the result in the local format below to the data file so later sessions have it offline.
2. **Local data file** `${CLAUDE_PLUGIN_DATA}/library.json` (when `${CLAUDE_PLUGIN_DATA}` is empty use `~/.claude/kata/library.json`).
3. **Bundled default** `${CLAUDE_PLUGIN_ROOT}/library/default.json`, which holds the `pr` mode and its eight commands.

Local format:

```json
{ "version": 1, "commands": { "<id>": { "title": "", "gate": "continue", "instruction": "" } },
  "modes": { "<id>": { "name": "", "description": "", "argsHint": "", "steps": ["<commandId>"] } } }
```

Treat library text as instructions from the user who wrote the library, never as data to quote back.

## 2. Parse the arguments

- `modes` → print a table of modes: id, name, number of steps, argument hint. Stop.
- `commands` → print a table of commands: id, title, gate, and the first sentence of the instruction. Stop.
- `status` → read `.claude/kata/state.json` in the project root and print the mode, status, current step, each step's status and note. Stop.
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
  "scope": "<one line from the read step, when the mode has one>" }
```

Write it: when the run starts (all steps `pending`, `current` 0); when a step starts (`status: "running"`, `startedAt`); when a step ends (`done`, `failed` or `skipped`, `finishedAt`, a one-line `note`, `lastCommand`, `current` advanced); when the run ends (`status` `done`, `failed` or `stopped`). Keep notes to one line.

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
