---
name: kata-edit
description: Create or change Kata commands and modes from the terminal, writing to the configured claude.ai artifact or to the local library file. Use for /kata-edit command <id>, /kata-edit mode <id>, /kata-edit new command|mode <id>, /kata-edit delete command|mode <id>.
argument-hint: "command <id> | mode <id> | new command|mode <id> | delete command|mode <id>"
---

# Kata edit

Arguments: `$ARGUMENTS`

The library source comes from the `kata:config` section of your context: `artifact` (write with the `ArtifactData` tool, loaded via ToolSearch `select:ArtifactData`) or `local` (edit `${CLAUDE_PLUGIN_DATA}/library.json`, or `~/.claude/kata/library.json` when the data directory is empty).

Shapes: a command is `{ title, gate, instruction, updatedAt }`; a mode is `{ name, description, argsHint, steps: ["<commandId>"], updatedAt }`. Gates: `continue` (go on), `confirm` (pause and ask the user before the next step), `stop-on-fail` (end the run when the step fails). Ids are lowercase `[a-z0-9._~-]`. The full format is `${CLAUDE_PLUGIN_ROOT}/schemas/library.schema.json`; check a document against it before writing.

1. Read the current item (artifact: `ArtifactData` `get` with `collection` `commands` or `modes` and the `doc_id`; keep its `version` for the write). For `new`, check the id is free.
2. Ask the user in plain text what should change when the arguments do not say. For a new command, ask for the title, gate and instruction; write the instruction in the second person as an order to Claude ("Read…", "Run…", "Do not…"), one paragraph, specific about inputs, outputs and what counts as done. For a new mode, ask for the name, description, argument hint and the ordered command ids; every id must exist.
3. Show the resulting document and apply it: artifact → `ArtifactData` `set` with `if_version` (omit it only when creating); local → rewrite the file. Delete with `ArtifactData` `delete`, refusing to delete a command that a mode still uses.
4. When the source is the artifact, also refresh the local cache as `/kata-sync` would, so offline sessions see the change.

Never write a command whose instruction asks for commit trailers, secrets in the repo, or skipping tests; say why and stop.
