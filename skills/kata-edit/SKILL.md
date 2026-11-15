---
name: kata-edit
description: Create or change Kata commands and modes from the terminal, writing to the configured claude.ai artifact or to the local library file. Use for /kata-edit command or mode followed by an id, /kata-edit new command or new mode, /kata-edit add example followed by an example id, and /kata-edit delete command or delete mode.
argument-hint: "command ID | mode ID | new command|mode ID | add example ID | delete command|mode ID"
---

# Kata edit

Arguments: `$ARGUMENTS`

The library source comes from the `kata:config` section of your context: `artifact` (write with the `ArtifactData` tool, loaded via ToolSearch `select:ArtifactData`) or `local` (edit `~/.claude/kata/library.json` (or `$KATA_HOME/library.json` when `KATA_HOME` is set), the path the Kata mod reads).

Shapes: a command is `{ title, slash, gate, instruction, updatedAt }`, where `slash` is the slash command that runs it alone (lowercase letters, digits, `-` and `_`; unique; never `kata`, `kata-sync`, `kata-edit` or `kata-panel`; default `kata-<id>`); a mode is `{ name, slash, description, argsHint, steps: ["<commandId>"], updatedAt }`, its `slash` optional and following the same rules as a command's (names are unique across commands and modes). Gates: `continue` (go on), `confirm` (pause and ask the user before the next step), `stop-on-fail` (end the run when the step fails). Ids are lowercase `[a-z0-9._~-]`. The full format is `${CLAUDE_PLUGIN_ROOT}/schemas/library.schema.json`; check a document against it before writing.

1. Read the current item (artifact: `ArtifactData` `get` with `collection` `commands` or `modes` and the `doc_id`; keep its `version` for the write). For `new`, check the id is free.
2. Ask the user in plain text what should change when the arguments do not say. For a new command, ask for the title, slash command, gate and instruction; write the instruction in the second person as an order to Claude ("Read…", "Run…", "Do not…"), one paragraph, specific about inputs, outputs and what counts as done. For a new mode, ask for the name, an optional slash command, description, argument hint and the ordered command ids; every id must exist. A library holds any number of commands and modes.
3. Show the resulting document and apply it: artifact → `ArtifactData` `set` with `if_version` (omit it only when creating); local → rewrite the file. Delete with `ArtifactData` `delete`, refusing to delete a command that a mode still uses.
4. When the source is the artifact, also refresh the local cache as `/kata-sync` would, so offline sessions see the change. The Kata mod reads the cache within two seconds, so a new or renamed slash command works right away in this session.

Never write a command whose instruction asks for commit trailers, secrets in the repo, or skipping tests; say why and stop.

## Copying from the steps library

`${CLAUDE_PLUGIN_ROOT}/library/examples.json` is the steps library: example commands and modes, such as a pull-request workflow, that people copy and adapt. It is not part of anyone's library.

- `add example ID`: copy the example mode with that id together with every command it lists, or else the example command with that id. When an id names both, it means the mode, which brings the command along; `add example command ID` copies the command alone. An id already in the user's library is never overwritten: ask in plain text for a new id, or skip that item. Write as in step 3, then show what was added and the slash commands it brings.
- `new command ID`: when the user asks for something close to an example, offer it in plain text as a starting point, and adapt its instruction to what they asked.
