---
name: kata-setup
description: Set up Kata for this user. Publishes their own private Kata Library page on claude.ai and points the plugin at it, so commands and modes edited on the page reach every terminal session. Use for /kata-setup, or when the user asks to create or connect a Kata Library page.
argument-hint: "[existing artifact URL] [--local]"
---

# Kata setup

Arguments: `$ARGUMENTS`

You give the user a library of their own. Report each step in one line as you finish it. Ask questions in plain text, never with a form or multiple-choice widget.

## 1. Decide where the library lives

- With `--local`: the library stays in the local data file only. Create `${CLAUDE_PLUGIN_DATA}/library.json` (or `~/.claude/kata/library.json` when `${CLAUDE_PLUGIN_DATA}` is empty) as `{ "version": 1, "commands": {}, "modes": {} }` unless that file exists, set the plugin's `source` to `local` (section 4), and go to section 5.
- With an artifact URL in the arguments: the user already has a Kata Library page. Skip section 2 and use that URL.
- Otherwise, when the `kata:config` section of your context already gives an artifact URL, tell the user Kata is already connected to that page and ask in plain text whether to keep it or create a new one. Wait for the answer.
- When the `Artifact` and `ArtifactData` tools are not available in this session (load them with ToolSearch `select:Artifact,ArtifactData` when they are deferred), say that a Kata Library page needs a session signed in to claude.ai, and offer `--local` instead. Stop.

## 2. Publish the page

Read `${CLAUDE_PLUGIN_ROOT}/artifact/kata-library.html` in full, then publish it with the `Artifact` tool: `file_path` that file, `icon` `list`, a one-line `description` (`Commands and modes for the Kata Claude Code plugin`), and these capabilities, exactly:

```json
{ "db": { "rules": [ { "path": "", "read": "view", "write": "admin" } ] }, "user": {} }
```

Everyone who can open the page reads the library; only people with edit access change it. The page is private until the user shares it.

## 3. Start the library

A new page starts empty: the user's library holds only what they write or copy. List both collections once to confirm what the page holds.

Then tell the user about the steps library, `${CLAUDE_PLUGIN_ROOT}/library/examples.json`: example commands and a pull-request mode they can copy and adapt. Ask in plain text whether to copy any of it now. When they name examples, write each into the page's store with one `ArtifactData` `batch` call: a `set` in collection `commands` or `modes`, the example's id as `doc_id`, its fields as `data` plus `updatedAt` now, and no `if_version` for a new document. A mode brings every command it lists. Never overwrite a document that exists.

## 4. Point the plugin at it

Find this plugin's id with `claude plugin list --json`: the entry whose id starts with `kata@` (for example `kata@kata-dojo` or `kata@synced`). Save the settings with:

```bash
printf '%s' '{"source":"artifact","artifactUrl":"<URL>"}' | claude plugin configure <id> --values-stdin
```

(`{"source":"local"}` for `--local`.) When the plugin was loaded with `--plugin-dir` and has no installed id, tell the user to open `/config`, find the Kata plugin and paste the URL into "Kata Library artifact URL".

## 5. Finish

Write the library in the local format (see the `/kata` skill) to the local data file, so the Kata mod registers its slash commands at once. Then print, in this order:

- the page's URL, and that it is private to them until they share it;
- the modes and commands now available, each with the slash command that runs it, or that the library is empty and how to add to it (the page's **+ New** and **Steps library**, `/kata-edit new command`, `/kata examples`);
- that edits on the page reach terminal sessions when a session starts, every ten minutes, on `/kata-refresh`, and at every `/kata` call;
- that `/kata-panel` opens the live pane.
