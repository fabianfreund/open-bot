# Roadmap

## Built and verified

- Project folder format, creation, and loading
- Agent store, hiring, archiving, per-agent workspaces and briefs
- Conversations: user DMs and bot-to-bot channels, JSONL history
- Turn loop with per-conversation queueing, streaming, and abort
- Codex provider on a ChatGPT subscription, with resumable threads
- Echo provider for offline UI work
- Skills: `list_bots`, `hire_bot`, `message_bot`, `ask_user`, `remember`
- MCP bridge exposing skills to Codex, with per-agent allow-lists
- Delegation with reply relay, depth and deadlock guards
- HTTP + WebSocket API with token auth
- Electron app: onboarding, sidebar, chat, streaming, trace, hiring
- Onboarding bot that greets you and interviews you
- Inline cards, with a question card and a renderer registry

Verified end to end against real Codex turns: tool discovery, `list_bots`,
`message_bot` with a relayed reply, and `ask_user` producing a card the model
composed itself.

## Next

**Make the team feel alive**

- Unread counts and a badge per bot (`AgentView.unread` is plumbed, always 0)
- Notifications when a bot messages you while the app is in the background
- A bot that starts work on a schedule rather than only when spoken to

**Give bots more to work with**

- Attachments: drop a file into a chat and the bot can read it
- Subprojects: `workspaces` in the manifest is honoured but nothing creates them
- More card types: confirm, pick-many, a file preview, a simple table

**Sand off the edges**

- Editing a bot from the app (only creating is wired up)
- Provider settings UI driven by `ProviderInfo.options`
- Retry on a failed turn without retyping
- Search across conversations

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
- Model names are not validated. Codex rejects models your plan cannot use.
  `gpt-5.1-codex-mini` is not available on a ChatGPT account. A new project
  names no model, so Codex uses the one in `~/.codex/config.toml`.

## Open questions

- **Should a relayed answer wake the bot that asked?** Today it lands in the
  chat and stops, so you decide what happens next. Automatic continuation is
  more useful and much easier to run away with.
- **Where do skills come from?** Built-in today. A plugin folder inside the
  project would let a team carry its own, at the cost of running code from a
  project folder.
- **How much of the trace should be visible by default?** Currently: titles
  only, detail on click, reasoning hidden entirely.
