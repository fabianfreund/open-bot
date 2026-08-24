# OpenBot

A team of bots that live on your computer, and a chat app to talk to them.

Self-hosted. Your work stays in a folder you own. Runs on your existing Codex
(ChatGPT) subscription. No API keys, no per-token billing.

---

## What it is

You run OpenBot on one computer. It creates a project folder, and inside it a
team of bots. Each bot has a name, a job, and its own folder to work in. You
chat with them the way you would message a colleague:

- Ask a bot to do something, and it does it in its own workspace.
- A bot can hire another bot when a job needs its own owner.
- A bot can pass work to a colleague; the answer comes back into your chat.
- A bot can ask you a question when it genuinely needs one.

From another device on your Tailscale network, open the same app, enter the
address and pairing code, and you are in the same chats.

## Status

Early. The skeleton is complete and verified end to end: creating a project,
hiring bots, chatting, delegation between bots, and the Codex provider running
real turns. See [docs/09-roadmap.md](docs/09-roadmap.md) for what is next.

## Requirements

- Node.js 20.11 or newer
- [Codex CLI](https://developers.openai.com/codex/cli) installed and signed in
  with your ChatGPT account (`codex login`)
- pnpm 9 (`corepack enable`)
- Tailscale, only if you want to reach the team from another device

## Getting started

```bash
pnpm install
pnpm build          # build the packages
pnpm dev            # start the desktop app
```

On first launch, choose **New team**, give it a name, and pick an empty folder.
The app creates the project there and opens the chat.

To run a team on a machine with no display:

```bash
pnpm serve /path/to/project --host 0.0.0.0
```

It prints the address and pairing code to connect from the desktop app.

## Layout

```
packages/shared      types and the wire protocol, shared by everything
packages/core        the runtime: projects, agents, providers, skills, turns
packages/server      HTTP + WebSocket API over a runtime
packages/client      typed client for that API (Electron today, mobile later)
packages/skills-mcp  exposes OpenBot skills to a provider over MCP
apps/desktop         the Electron chat app
```

## Docs

| Doc                                                     | What is in it                                  |
| ------------------------------------------------------- | ---------------------------------------------- |
| [01-concepts.md](docs/01-concepts.md)                   | The words this project uses and what they mean |
| [02-architecture.md](docs/02-architecture.md)           | How the pieces fit and why                     |
| [03-project-format.md](docs/03-project-format.md)       | What is on disk in a project folder            |
| [04-providers.md](docs/04-providers.md)                 | Adding a model backend                         |
| [05-skills.md](docs/05-skills.md)                       | Adding a skill                                 |
| [06-protocol.md](docs/06-protocol.md)                   | The HTTP and WebSocket API                     |
| [07-networking.md](docs/07-networking.md)               | Hosting, pairing, and Tailscale                |
| [08-design-principles.md](docs/08-design-principles.md) | The rules the UI and copy follow               |
| [09-roadmap.md](docs/09-roadmap.md)                     | What is built and what is next                 |

## Licence

MIT
