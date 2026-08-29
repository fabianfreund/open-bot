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

| Package               | Responsibility                                     | Depends on       |
| --------------------- | -------------------------------------------------- | ---------------- |
| `@openbot/shared`     | Types, zod schemas, the wire protocol              | nothing          |
| `@openbot/core`       | The whole backend: state, providers, skills, turns | shared           |
| `@openbot/server`     | HTTP + WebSocket over a runtime                    | shared, core     |
| `@openbot/client`     | Typed client for that API                          | shared           |
| `@openbot/skills-mcp` | Exposes skills to a provider over MCP              | shared           |
| `@openbot/desktop`    | Electron app                                       | all of the above |

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

1. A channel `a2a.<a>.<b>` logs the request (for `look_back`), authored by
   Chief of Staff.
2. Social runs the turn in Social's own chat with the person. Tool calls and
   steps show there as Social works.
3. Social's answer is logged on the channel, then wakes Chief of Staff, which
   speaks in its own chat in its own voice.

Social never posts into a chat the person opened with Chief of Staff. A chat
with one bot only ever contains that bot. If Social needs the person, it uses
`ask_user`, which lands in Social's own chat. The store refuses any other
bot writing there.

Two guards keep this from running away:

- **Depth.** `MAX_DELEGATION_DEPTH` is 3. A bot asking a bot asking a bot stops.
- **Deadlock.** Waiting on a colleague who is already working on your request
  is refused rather than hung.

By default `wait` is false: the asking bot finishes its turn, and the answer
wakes it again when it lands. That matches how people actually work, and it
means a slow colleague never blocks a chat.

## What a bot remembers

Four different lifetimes, and it matters which is which:

- **History** is forever. `.openbot/messages/<conversation>.jsonl` is appended
  to and never trimmed. Nothing here is ever deleted.
- **Team notes** are forever and shared. `memory/notes.db` holds what the team
  decided and learned, one sentence per note, readable by every bot. Chats are
  per bot; notes are the team's.
- **The provider thread** is not. Codex holds the live context behind a thread
  id in `conversation.providerThreads[agentId]`. That thread is dropped when a
  bot is renamed or rebriefed, because it carries the old brief with it.
- **The recap** bridges the two. A fresh thread over an existing chat gets the
  brief plus the last 12 messages, and is told how many it did not get. From
  there `look_back` fetches anything older, by words or by date.

Sessions end on their own. Every minute the runtime drops the thread of any
chat quiet for longer than `settings.sessionMinutes` (60 by default), so a team
left open overnight is not holding context nobody is using. A bot with no live
thread shows a **grey dot**: still on the team, not holding this chat in mind.
Messaging it starts a new session and turns the dot green. Presence is derived
from the thread, not stored, so it survives a restart and cannot drift out of
sync with what the bot actually holds.

Retiring is the other thing entirely, and only ever manual: going offline costs
nothing and reverses itself, retiring means you are done with that colleague.

That last part is the whole design: a bot is never quietly missing something.
When the recap is short it says so, and `look_back` searches every message in
every chat that bot has been part of, retired colleagues included.

## The team notes

`look_back` searches what was said. The notes hold what was settled, and they
are shared, so something one bot worked out is something every bot knows.

A note is a date, one sentence, some tags, and a longer body only when the
sentence genuinely leaves something out. That shape is the point: `recall`
returns thirty notes for the price of a paragraph, marking which ones have a
body worth fetching, and `read_notes` fetches every body a bot decided it needs
in a single call. Memory that grows for years without growing what a turn
costs.

**A bot never writes a note itself.** `remember` hands the text to a librarian:
a one-shot model run with no tools, no thread, and no memory of its own, which
sees every summary already on file and answers with one of three verdicts.

- `keep`, with a sentence and tags of its own wording
- `update`, when this corrects a note already on file
- `skip`, when it is progress, a restatement of a brief, or already covered

The verdict goes back to the bot inside its own turn, so a bot that writes down
what it is about to do next is told so, and learns. If the librarian is
unavailable or answers with something that is not a verdict, the note is kept
as the bot wrote it. Nothing a bot asked to keep is ever lost to a failure
upstream.

Correcting a note writes a new one and points the old one at it. Superseded
notes drop out of search and stay in the file, so a decision that changed can
still be traced.

## Leaving the team

Nothing is deleted, ever. `retire_bot` (or `DELETE /api/agents/:id`) sets
`archived: true`, and that is all it does:

- The bot stops appearing in `list_bots` and in the sidebar.
- `agents/<slug>/` keeps its workspace, its brief, and its work.
- Every chat it was in stays, and `look_back` still finds what it said.
- Messaging it says it has left the team, not that it never existed.

Nothing archives a bot on its own. It only happens when someone asks.

## Extension points

Each is a registry you add to.

| To add               | Write                 | Register in                           |
| -------------------- | --------------------- | ------------------------------------- |
| A model backend      | a `Provider`          | `providers/index.ts`                  |
| A capability         | a `Skill`, or a folder in `tools/` | `skills/builtin/index.ts` (builtin) or `tools/<name>/TOOL.md` (this team) |
| An inline chat block | a card component      | `renderer/components/cards/index.tsx` |
| A file type          | a `FileKind`          | `shared/models/file.ts` (and a preview in `renderer/components/attachments/` if it should look different) |
| A storage layout     | change `ProjectPaths` | one file                              |

The turn loop is the same shape. `turns/scheduler.ts` decides when work runs (one conversation, one bot, abort, close). `turns/loop.ts` is one provider call. `turns/delegate.ts` is how a bot asks a colleague. Changing the flow means those files, not `runtime.ts`.

## Why files, and the one place that is a database

A project is JSON and JSONL on disk. Message history appends; the project
manifest is written whole with write-then-rename so a crash cannot truncate it.

This is a deliberate trade. It means a project folder you can read, diff, back
up, and put in git, and no migration story for an early project. If message
volume ever makes this the bottleneck, the store is behind `ConversationStore`
and can be swapped without touching the runtime.

The team notes are the exception, and only because the access pattern is
genuinely a query: search these words, with these tags, in this date range,
ranked. Doing that over a folder of markdown means reading every file into
memory on every call, which is exactly the cost the notes exist to avoid.

`memory/notes.db` is SQLite through `node:sqlite`, which ships inside Node and
inside Electron. No native module, nothing to rebuild per platform, nothing
extra to package. The trade is a binary file in an otherwise readable folder,
so every write also regenerates `memory/notes.md`: the same one-way
relationship `AGENTS.md` has with `agent.json`. The database is the store, the
markdown is the copy you can read and diff.
