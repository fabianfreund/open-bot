# ADR 0001. Codex as the first provider

**Status:** accepted · 2026-08-24

## Context

OpenBot needs a model backend that a non-developer can actually run. The
options were an API key against a hosted model, a local model, or an existing
agent CLI.

An API key means signing up for a developer account, holding a secret, and
paying per token with no ceiling. That is a bad fit for someone who just wants
a team of bots. A local model means hardware requirements and much weaker tool use.

The Codex CLI authenticates with a ChatGPT account, which the target user
plausibly already has, and it already implements the hard parts: a sandbox,
file editing, shell execution, web search, and MCP tool calling.

## Decision

Use the Codex CLI through `@openai/codex-sdk` as the first provider, and expose
OpenBot's own skills to it as an MCP server.

Consequences of that second half: file reading, writing, searching, and command
execution are **not** OpenBot skills. OpenBot only implements what makes a team
a team: hiring, delegating, asking the user, shared memory.

## Consequences

Good:

- No API keys, no per-token billing, no separate signup.
- Sandboxing, patching, and search come for free and are battle-tested.
- MCP is a real standard, so the skill bridge works for any future provider
  that speaks it.

Bad:

- A hard dependency on the Codex CLI being installed and signed in. Mitigated
  by `health()` reporting it in plain language rather than failing a turn.
- Model availability is decided by the user's ChatGPT plan, and the error when
  a model is unavailable comes from the API, not from us.
- Turn granularity is whatever Codex emits. There is no token-level streaming,
  so replies appear per message item rather than word by word.
- Codex's approval prompts do not fit an unattended team, so MCP tools are set
  to `default_tools_approval_mode: 'approve'`. What a bot may do is decided by
  OpenBot's allow-list and the sandbox instead.

## Alternatives considered

- **OpenAI Agents SDK** (`@openai/agents`) is a better-fitting agent framework,
  but it authenticates with an API key, which defeats the main reason for
  choosing Codex. Worth revisiting as a second provider for people who do have
  a key.
- **Anthropic / Claude Code** has the same shape and the same subscription
  argument. A good second provider. The `Provider` interface exists so that is
  a file, not a refactor.
