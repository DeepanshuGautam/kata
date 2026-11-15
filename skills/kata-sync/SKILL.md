---
name: kata-sync
description: Pull the Kata library (commands and modes) from the configured claude.ai artifact into the local data file, showing what changed before replacing it. Use for /kata-sync, or when /kata cannot reach the artifact.
argument-hint: "[--force] [--from PATH.json]"
---

# Kata sync

Arguments: `$ARGUMENTS`

Local file: `${CLAUDE_PLUGIN_DATA}/library.json` (when `${CLAUDE_PLUGIN_DATA}` is empty use `~/.claude/kata/library.json`).

1. Find the artifact URL in the `kata:config` section of your context. With `--from <path>`, read that JSON file instead of the artifact (the Kata Library page's **Export JSON** produces this format).
2. Without `--from`: load the `ArtifactData` tool (ToolSearch `select:ArtifactData`) and `list` the `modes` and `commands` collections of the artifact. Convert them to the local format:

   ```json
   { "version": 1, "exportedAt": "<ISO>", "commands": { "<id>": { "title", "slash", "gate", "instruction" } },
     "modes": { "<id>": { "name", "slash", "description", "argsHint", "steps": ["<commandId>"] } } }
   ```

3. Validate against `${CLAUDE_PLUGIN_ROOT}/schemas/library.schema.json` (read it and check each rule yourself when no validator is installed): every mode step names an existing command; every gate is `continue`, `confirm` or `stop-on-fail`; ids are lowercase `[a-z0-9._~-]`; every `slash` is lowercase `[a-z0-9_-]`, unique across commands and modes, and none of `kata`, `kata-sync`, `kata-edit`, `kata-setup`, `kata-panel`, `kata-refresh`. Report problems and stop unless `--force`.
4. Compare with the local file: added, removed and changed commands and modes, each as one line. Print the list. If nothing changed, say so and stop.
5. Write the new file. Print the path and the counts. The Kata mod picks the file up within two seconds and registers the slash commands of new or renamed commands and modes; say so.

If the `ArtifactData` tool is not available in this session (a terminal without the claude.ai connection), say so and point to `--from` with a file exported from the Kata Library page. When no artifact URL is configured, point to `/kata-setup`.
