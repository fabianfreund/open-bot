# Architecture

## The shape of it

```
┌───────────────────────────────────────────────┐
│ apps/desktop            Electron              │
│  ┌────────────┐         ┌──────────────────┐  │
│  │ main       │◀── IPC ─│ renderer (React) │  │
│  │  Host      │         │  @openbot/client │  │
│  └─────┬──────┘         └────────┬─────────┘  │
└────────┼─────────────────────────┼────────────┘
         │ in-process              │ HTTP + WebSocket
         ▼                         ▼
   ┌───────────────────────────────────────┐
   │ @openbot/server   Fastify + /ws       │
   └──────────────────┬────────────────────┘
                      ▼
   ┌───────────────────────────────────────┐
   │ @openbot/core     OpenBotRuntime      │
   │  project · agents · conversations     │
   │  providers · skills · turn loop       │
   └───┬──────────────────────────┬────────┘
       ▼                          ▼
  project folder            provider (Codex CLI)
                                  │ spawns, over stdio
                                  ▼
                       @openbot/skills-mcp ──HTTP──▶ back to the server
```

## One rule: the UI never talks to the runtime directly

Even when the desktop app is hosting the team in its own main process, the
renderer goes over HTTP and WebSocket to reach it. There is exactly one code
path, so "my team is on this laptop" and "my team is on the machine in the
office" are the same program.

That is why `Host.open()` starts a real server on `0.0.0.0` rather than wiring
the runtime straight into IPC.

## Packages

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `@openbot/shared` | Types, zod schemas, the wire protocol | nothing |
| `@openbot/core` | The whole backend: state, providers, skills, turns | shared |
| `@openbot/server` | HTTP + WebSocket over a runtime | shared, core |
| `@openbot/client` | Typed client for that API | shared |
| `@openbot/skills-mcp` | Exposes skills to a provider over MCP | shared |
| `@openbot/desktop` | Electron app | all of the above |

Dependencies point one way. `core` has never heard of HTTP; `server` has never
heard of Electron.

## How a message becomes a reply

1. The renderer `POST`s to `/api/conversations/:id/messages`.
2. `OpenBotRuntime.sendUserMessage` appends the message, emits
   `message.created`, and queues a turn. The queue is per conversation, so a
   second message waits rather than interleaving.
3. `TurnRunner` creates an empty assistant message with `streaming: true` and
   emits it, so the UI shows a typing indicator immediately.
4. The provider runs, emitting normalised `ProviderStreamEvent`s for text,
   trace steps, status, and usage. The runner folds each into the message and
   flushes to clients at most every 120 ms.
5. On completion the message is written to disk once, `streaming` goes false,
   and the provider's conversation handle (for Codex, the thread id) is saved
   so the next turn resumes rather than restarts.

Nothing in steps 3–5 knows what Codex is. That is the provider's job.

## How a bot calls a skill

Codex has no idea OpenBot exists. It speaks MCP, so OpenBot speaks MCP back.

1. Before a turn, `CodexProvider` writes an MCP server into the Codex config
   pointing at `@openbot/skills-mcp`, with the agent id, conversation id,
   server URL, and token in its environment.
2. Codex spawns that bridge over stdio and asks it for a tool list. The bridge
   calls `GET /api/agents/:id/skills` and returns the agent's allowed skills as
   MCP tools, JSON Schema included.
3. The model calls a tool. The bridge `POST`s to `/api/skills/:id/invoke`.
4. The runtime executes the skill and returns text the model can read.

The agent id lives in the bridge's environment, not in the model's hands, so a
bot cannot claim to be a different bot.

`default_tools_approval_mode: 'approve'` is set on that MCP server because
nobody is sitting at a terminal approving tool calls. What a bot may do is
decided by OpenBot's skill allow-list and the Codex sandbox, not by prompts.

## Delegation

`message_bot` is the interesting one, because it turns a chat app into a team.

When Chief of Staff messages Social:

1. A channel conversation `a2a.<a>.<b>` is created if it does not exist.
2. The request is appended to that channel, authored by Chief of Staff.
3. Social runs a turn in the channel, in its own thread and its own workspace.
4. Social's answer is relayed back into the conversation that asked for it,
   marked `relayedFrom`, which is what the UI shows as "Message from Social".

Two guards keep this from running away:

- **Depth.** `MAX_DELEGATION_DEPTH` is 3. A bot asking a bot asking a bot stops.
- **Deadlock.** Waiting on a colleague who is already working on your request
  is refused rather than hung.

By default `wait` is false: the asking bot finishes its turn and the answer
arrives later as its own message. That matches how people actually work, and it
means a slow colleague never blocks a chat.

## Extension points

Four, all the same shape. Each is a registry you add to.

| To add | Write | Register in |
| --- | --- | --- |
| A model backend | a `Provider` | `OpenBotRuntime.open` |
| A capability | a `Skill` | `skills/builtin/index.ts` |
| An inline chat block | a card component | `renderer/components/cards/index.tsx` |
| A storage layout | change `ProjectPaths` | one file |

## Why files and not a database

A project is JSON and JSONL on disk. Message history appends; the project
manifest is written whole with write-then-rename so a crash cannot truncate it.

This is a deliberate trade. It means no native modules in Electron, a project
folder you can read, diff, back up, and put in git, and no migration story for
an early project. If message volume ever makes this the bottleneck, the store
is behind `ConversationStore` and can be swapped without touching the runtime.
