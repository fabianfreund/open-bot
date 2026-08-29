# Protocol

One HTTP API and one WebSocket, both served by `@openbot/server`. The desktop
app uses `@openbot/client`; anything that speaks HTTP can use this directly.

## Authentication

Every `/api` route except `/api/health` needs the project token:

```
Authorization: Bearer <token>
```

The WebSocket takes it as `?token=`. The token is generated on first run, kept
in `.openbot/token` with mode `0600`, and shown in the app as the pairing code.

`OPTIONS` is exempt. A CORS preflight never carries credentials, so rejecting
it fails the real request before the browser sends it. Any client on a real
http origin, including the renderer under `pnpm dev`, preflights every call
that carries an `Authorization` header.

## REST

| Method   | Path                              | Purpose                                   |
| -------- | --------------------------------- | ----------------------------------------- |
| `GET`    | `/api/health`                     | Liveness and project name. No auth.       |
| `GET`    | `/api/project`                    | The manifest and its absolute root        |
| `GET`    | `/api/providers`                  | Registered providers and their health     |
| `GET`    | `/api/skills`                     | Every registered tool                     |
| `GET`    | `/api/agents`                     | Agents with live status and last message  |
| `POST`   | `/api/agents`                     | Hire a bot → `{ agent, conversationId }`  |
| `PATCH`  | `/api/agents/:id`                 | Update a bot                              |
| `DELETE` | `/api/agents/:id`                 | Archive a bot (never deletes work)        |
| `GET`    | `/api/agents/:id/skills`          | The tools that bot may use                |
| `GET`    | `/api/agents/:id/conversation`    | The user's chat with that bot             |
| `GET`    | `/api/conversations`              | All conversations                         |
| `GET`    | `/api/conversations/:id/messages` | Full history, oldest first                |
| `POST`   | `/api/conversations/:id/messages` | Send a message; starts a turn             |
| `POST`   | `/api/files`                      | Save a dropped file into `inbox/`         |
| `GET`    | `/api/files?path=`                | Bytes of a project file, for previews     |
| `POST`   | `/api/conversations/:id/answer`   | Answer an inline card                     |
| `POST`   | `/api/conversations/:id/read`     | Clear the unread count for that chat      |
| `POST`   | `/api/conversations/:id/abort`    | Stop the running turn                     |
| `POST`   | `/api/skills/:id/invoke`          | Run a tool as a bot (used by the bridge)  |

`POST /api/files` is multipart, field `file`. The response is an `Attachment`
(`name`, `path`, `mime`, `size`, `kind`). `POST /api/conversations/:id/messages`
takes `{ text, attachments }`, where `attachments` is an array of those paths,
and either text or at least one file is enough.

Request and response shapes are the zod schemas in `@openbot/shared`, so the
client and server cannot drift.

## WebSocket

`GET /ws?token=…`

The server sends `hello` immediately with the project and the current agents,
then streams `ServerEvent`s. Clients load state over REST and follow the
stream; there is no replay, so a reconnect refetches.

```ts
type ServerEvent =
  | { type: 'hello'; protocol: number; project: ProjectInfo; agents: AgentView[] }
  | { type: 'project.updated'; project: ProjectInfo }
  | { type: 'agent.created' | 'agent.updated'; agent: AgentView }
  | { type: 'agent.removed'; agentId: string }
  | { type: 'agent.status'; agentId: string; status: AgentStatus; detail?: string }
  | { type: 'conversation.updated'; conversation: Conversation }
  | { type: 'message.created'; message: Message }
  | { type: 'message.updated'; message: Message }
  | { type: 'notice'; level: 'info' | 'warn' | 'error'; text: string }
  | { type: 'skills.updated'; skills: SkillInfo[] };
```

One union on one socket. A new feature adds a member here, not a new endpoint
to poll.

### Streaming a reply

A reply arrives as `message.created` with `streaming: true` and an empty body,
then a series of `message.updated` as it grows, at most one every 120 ms, and
a final `message.updated` with `streaming: false`. Render `message.updated` by
replacing the message with the same `id`.

### Reconnecting

`EventStream` in `@openbot/client` reconnects with backoff up to 8 s. Over a
tailnet the link drops whenever a laptop sleeps, so this is the normal case,
not an error path.

## Protocol version

`PROTOCOL_VERSION` in `@openbot/shared` is sent in `hello` and returned by
`/api/health`. Clients should check the major before trusting a host.
