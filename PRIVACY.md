# Privacy

Kata is a Claude Code plugin. It has no server and no account, collects nothing, and sends no telemetry.

## What stays on your machine

- **Your library:** the commands and modes you write, in `~/.claude/kata/library.json` (or `$KATA_HOME/library.json`).
- **Run state:** the current run's steps, notes and issues, in `<project>/.kata/state.json`, which git ignores.

They stay until you delete them.

## What Kata reads from elsewhere

If you connect a Kata Library page, Kata reads that page, your own private claude.ai artifact, through Claude Code's own artifact tool, signed in as you. Nothing is sent to the page by the plugin's mod. The `/kata-edit` and `/kata-setup` skills write to it only when you ask them to.

## What Claude sees

Kata adds a short section to Claude's context with your Kata settings and the ids of your commands and modes, and the `/kata` skill gives Claude your commands as instructions. That is part of your own Claude Code session, handled under your account's terms.

## Contact

Open an issue at https://github.com/DeepanshuGautam/kata/issues.
