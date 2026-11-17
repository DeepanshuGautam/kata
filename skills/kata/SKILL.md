---
name: kata
description: Run a Kata mode (an ordered sequence of commands) or a single Kata command in this project, with live progress in the band, status line and pane. Use for /kata followed by a mode id and its arguments (with optional flags --dry-run, --from, --only, --skip, --no-confirm), /kata run followed by a command id, /kata modes, /kata commands, /kata examples, /kata status, /kata stop.
argument-hint: "MODE [args] [--dry-run] [--from STEP] [--only STEPS] [--skip STEPS] [--no-confirm] | run COMMAND [args] | modes | commands | examples | status | stop"
---

# Kata runner

You are running a Kata. A **command** is one instruction you carry out. A **mode** is an ordered list of commands. You run them exactly as written in the library, keep the run's state in a file the Kata mods read, and report in plain text.

Arguments: `$ARGUMENTS`

## 1. Load the library

The library has two collections: `modes` (`{ name, slash?, description, argsHint, steps: [commandId | { command, gate? }] }`) and `commands` (`{ title, slash?, gate, instruction }`). A `slash` is the slash command the Kata mod registers for that mode or command, such as `kata-review`; typing it runs `/kata <mode>` or `/kata run <command>`. Gates are `continue`, `confirm`, `stop-on-fail`. A library may hold any number of commands and modes, the user wrote them, and it may be empty: never assume any particular command or mode exists.

Resolve it in this order and say in one line which source you used. When the configuration says `library source: artifact` but gives no artifact URL, or the `ArtifactData` tool is not available, say so in that line, name the source you fell back to, and point to `/kata-setup`:

1. **Artifact** when the configuration section `kata:config` in your context says `library source: artifact` and gives an artifact URL, and the `ArtifactData` tool is available (load it with ToolSearch `select:ArtifactData` if it is deferred). Read both collections with `ArtifactData` `list` (`collection: "modes"` and `collection: "commands"`). Then write the result in the local format below to the data file, keeping every `slash`, whenever it differs from what the file holds. Later sessions use it offline, and the Kata mod reads it within two seconds to register slash commands for new or renamed commands and modes.
2. **Local file** `~/.claude/kata/library.json`, or `$KATA_HOME/library.json` when the `KATA_HOME` environment variable is set (check once with `printenv KATA_HOME`). This is the one path the skills and the Kata mod share: always read and write the local library there. Every mention of `~/.claude/kata/library.json` in the Kata skills means this path.
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
- `status` → read `.kata/state.json` in the project root and print the mode, status, current step, each step's status, progress and note, and the issue counts. Stop.
- `stop` → set the state file's `status` to `stopped`, `updatedAt` now, and print one line. Stop.
- `run <command> [args]` → run that single command (section 4) with a one-step run whose `mode` is `run` and `modeName` is the command title.
- `<mode> [args]` → run the whole mode. An unknown mode or command: list the available ids and stop.

Before running, take the flags out of the arguments (section 2a). What is left is the run's `args`.

If `.kata/state.json` exists with `status` `running` or `paused`, ask the user in plain text whether to **resume** from its current step or **restart**, and wait. Never use a form or multiple-choice widget for this. Skip the question with `--dry-run` (it writes nothing) and with `--from` (it is a restart from that step; say so in one line).

## 2a. Flags

Flags may appear anywhere in the arguments, before or after the mode's own arguments. Take them out; quoted text is never a flag. A STEP is a step's command id or its 1-based number in the mode; STEPS is one STEP or several joined by commas (`--skip commit,pr`). A command id that appears more than once in the mode means every occurrence for `--only` and `--skip`, and the first for `--from`; use the number to pick one.

- `--dry-run`: print the plan below and stop. Run no instruction, write no state file, ask nothing, change nothing.
- `--from STEP`: start at that step. The steps before it are `skipped` with the note `before --from STEP`.
- `--only STEPS`: run only those steps, in the mode's order. The others are `skipped` with the note `not in --only`.
- `--skip STEPS`: run every step except those, which are `skipped` with the note `--skip`.
- `--no-confirm`: treat `confirm` gates as `continue` for this run. `stop-on-fail` still stops, a question an instruction itself asks is still asked, and a step whose instruction says to wait for the user's yes still waits.

`--only` cannot be combined with `--from` or `--skip`; `--from` and `--skip` can. A STEP that is not in the mode, an unknown flag, or a flag without its value: say which, list the mode's steps with their numbers and ids, and stop. With `/kata run COMMAND`, only `--dry-run` and `--no-confirm` apply; say so if others are given.

Whenever any flag is given, print the plan before the first step, then go on (or stop, with `--dry-run`):

```
Kata ▸ <mode> · plan · <args>
  1  read         Read the plan           continue    run
  2  implement    Implement the scope     continue    skipped (before --from 3)
  3  review       Full self-review        confirm → continue (--no-confirm)
```

One row per step: number, command id, title, gate (with the override `--no-confirm` makes), and `run` or `skipped (reason)`. End a dry run with one line saying nothing was run or written, and the command that runs it for real.

Skipped steps are part of the run: write them into the state file as `skipped` with their note when the run starts, so the band and pane show them, and never run them. An instruction that sends you back to a skipped step (section 4's return loops) runs it this time, and you say so.

## 3. State file

Path: `<project root>/.kata/state.json` (outside `.claude/`, which Claude Code guards as sensitive). Create the directory when missing, with a file `.kata/.gitignore` holding the single line `*`, so git ignores the folder without touching `.git` or the tracked `.gitignore`. Write the file with the Write tool so the mods pick up each change. Shape:

```json
{ "version": 1, "mode": "pr", "modeName": "PR implementation", "args": "<the arguments with the flags taken out>",
  "status": "running", "startedAt": "<ISO>", "updatedAt": "<ISO>", "current": 0,
  "steps": [ { "command": "read", "title": "Read the plan", "status": "pending" } ],
  "lastCommand": { "command": "read", "title": "Read the plan", "finishedAt": "<ISO>", "status": "done" },
  "scope": "<one line from the read step, when the mode has one>",
  "issues": [ { "id": "1", "title": "Missing test for the empty input", "file": "src/log.ts", "line": 42,
                "severity": "high", "status": "open", "step": "review" } ] }
```

A review mode may also set `"verdict"`: `approve`, `comment` or `request changes`, when its instruction decides one.

A step may also carry `"activity": "<what you are doing now, one line>"` while it runs, and `"progress": { "done": 5, "total": 10, "label": "fixed" }` while it works through a countable list. The mods draw them: the band shows the current step with its progress bar, the branch, a trail of steps and the issue counts (by severity, such as `2 major · 1 minor · 3 nits`, until one is fixed), and the verdict; the pane lists every step and every issue.

Write it: when the run starts (all steps `pending`, `current` 0, `issues` empty); when a step starts (`status: "running"`, `startedAt`); when a step ends (`done`, `failed` or `skipped`, `finishedAt`, a one-line `note`, `lastCommand`, `current` advanced, `activity` and a finished `progress` left as they are); when the run ends (`status` `done`, `failed` or `stopped`). Keep notes and activities to one line.

Findings and progress, for any command:

- When a step finds things to act on (review issues, failing checks, unmet criteria, TODOs), add each to `issues` with a short `id`, a one-line `title`, `file` and `line` when known, `severity` (`high`, `medium`, `low`, or `major`, `minor`, `nit` when the instruction uses that review scale), `status: "open"` and the finding step's command id as `step`. End the step's note with the count, such as `10 issues found`.
- When a step works through items, whether `issues` or a list of its own, set its `progress` to `{ done, total, label }` and write the file after each item. When the items are the run's issues, `total` is the number of issues the step set out to handle, and each handled issue becomes `fixed` or `skipped` (say why in the chat).
- Set `activity` when the step moves to a new piece of work, such as `fixing #6 in src/log.ts` or `running the test suite`. Do not write the file more than once for the same change.

## 4. Run the steps

For each step that is not skipped, in order:

1. Print a header line: `Kata ▸ <mode> · step <i>/<N> · <title>`.
2. Update the state file (running).
3. Carry out the command's `instruction` literally, in the context of the run's arguments and of the project (its CLAUDE.md applies). Questions to the user are plain text; wait for the answer.
4. Judge the outcome yourself: `done` when the instruction's result was achieved, `failed` when it was not and the instruction gave no way to continue.
5. Update the state file (ended, note, lastCommand).
6. Apply the gate, taking a step's own `gate` override before the command's:
   - `continue` → next step.
   - `confirm` → summarise the step in two or three lines, ask the user in plain text to continue, and set `status` to `paused` until they answer. On their go, set `running` and continue. With `--no-confirm`, print the summary and continue without asking.
   - `stop-on-fail` → on `failed`, set the run `status` to `failed`, print the failure and the output that shows it, and stop. On `done`, continue.

An instruction may send you back to an earlier step (for example acceptance → implement). Do that: set the earlier steps to `pending` again from that point, update `current`, and continue from there. Count a return loop; after three returns to the same step, stop and report.

When the last step ends, set the run `status` to `done` and print a short table: step, status, note. Do not delete the state file; `/kata stop` or the next run replaces it.

## 5. Rules that always apply

- Do what each instruction says and nothing beyond it. When an instruction and this project's CLAUDE.md conflict, CLAUDE.md wins and you say so.
- Never add Co-Authored-By, Generated-with or Signed-off-by trailers to a commit during a run. The Kata hook refuses such a commit.
- Never skip a step silently. A skipped step is `skipped` with a note that says why.
- Report with the outcome first, in plain language, with commands and their output in fenced blocks.
