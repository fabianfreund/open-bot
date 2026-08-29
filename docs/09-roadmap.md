# Roadmap

## Built and verified

- Project folder format, creation, and loading
- Agent store, hiring, archiving, per-agent workspaces and briefs
- Conversations: user DMs and bot-to-bot channels, JSONL history
- Turn loop with per-conversation and per-bot queueing, streaming, and abort
- Codex provider on a ChatGPT subscription, with resumable threads
- Echo provider for offline UI work
- Tools: `list_bots`, `hire_bot`, `change_bot`, `retire_bot`, `message_bot`,
  `ask_user`, `share_link`, `look_back`, `setup_team`, `create_tool`,
  `how_to_create_a_tool`, `remember`, `recall`, `read_notes`
- Team tools in `tools/`: a folder with TOOL.md and optional scripts, loaded
  into the same registry as the builtins, created with `create_tool`
- Team notes in SQLite, filed by a librarian pass so bots only keep what is
  worth keeping, with tags, date ranges, and full-text search
- MCP bridge exposing skills to Codex, with per-agent allow-lists
- Delegation that reports back to the asking bot, with depth and deadlock guards
- HTTP + WebSocket API with token auth
- Electron app: onboarding, sidebar, chat, streaming, trace, hiring, settings
- Editing a bot from the app: name, brief, tools, retire
- Onboarding bot that greets you, asks what this is about, then follow-ups,
  and finishes by pointing at the bots on the left
- A ping when a bot's message lands
- `setup_team` writes the goal, a handbook every brief loads, folders, and
  reference files; each hire says hello in their own chat
- Inline cards, with a question card that can ask several things at once
- Unread counts per bot, badged in the sidebar and sorted to the top
- Attachments: drop a file onto a chat, it lands in `inbox/`, the bot can
  read it, images are also shown to the model

Verified end to end against real Codex turns: tool discovery, `list_bots`,
`message_bot` with a reply handed back to the asking bot, and `ask_user`
producing a card the model composed itself.

## Next

**Make the team feel alive**

- A bot that starts work on a schedule rather than only when spoken to
- A system notification when a bot messages you while the app is in the background

**Give bots more to work with**

- Subprojects: `workspaces` in the manifest is honoured but nothing creates them
- More card types: confirm, pick-many, a file preview, a simple table

**Sand off the edges**

- Provider settings UI driven by `ProviderInfo.options`
- Retry on a failed turn without retyping
- Search across conversations
- The team notes in the app, so a person can read and correct them
- Offering the most relevant notes on a new thread, rather than waiting for a
  bot to think to call `recall`

**Reach**

- Package the app with electron-builder, including the MCP bridge as a resource
- A mobile client. `@openbot/client` is browser-only on purpose
- Pairing by QR rather than typing a token

## Known limits

- No socket replay. A reconnecting client refetches everything.
- The token does not rotate. Deleting `.openbot/token` unpairs every device.
- `message_bot` with `wait: true` blocks the calling bot's turn. Default is
  false for that reason.
- History is JSONL and fully loaded per conversation. Fine at chat volume; it
  is behind `ConversationStore` when it is not.
- Filing a note costs a model call, so `remember` takes a few seconds. It is
  worth it for what does not end up in the notes.
- Nothing prunes the notes. A team that runs for years will want a pass that
  retires notes nobody has recalled.
- Model names are not validated. Codex rejects models your plan cannot use.
  `gpt-5.1-codex-mini` is not available on a ChatGPT account. A new project
  names no model, so Codex uses the one in `~/.codex/config.toml`.
- A team tool's script runs from the project folder. That is the team's own
  code. Treat `tools/` like work you are willing to run.

## Open questions

- **How far should an answer carry?** A colleague's reply now wakes the bot
  that asked, which continues on its own. The depth cap is the only brake, and
  it may want a better one.
- **How much of the trace should be visible by default?** Currently: titles
  only, detail on click, reasoning hidden entirely.
