# Providers

A provider runs a bot's turns. Codex ships with OpenBot; anything else is a
file you add.

## The interface

```ts
export interface Provider {
  readonly info: ProviderInfo;
  run(input: ProviderRunInput, context: ProviderContext): Promise<ProviderRunResult>;
  health(): Promise<ProviderHealth>;
}
```

`run` streams by calling `context.emit()` with normalised events, and returns
the final text plus an optional handle for resuming the conversation next turn.

Providers translate their own output into `ProviderStreamEvent`:

| Event        | Meaning                                               |
| ------------ | ----------------------------------------------------- |
| `thread`     | The backend's conversation handle, saved for resuming |
| `text-delta` | Append to the reply                                   |
| `text-final` | Replace the reply                                     |
| `trace`      | A step to show: a command, a file change, a tool call |
| `status`     | `thinking`, `working`, `waiting-on-user`, `error`     |
| `usage`      | Token counts                                          |
| `error`      | Something went wrong                                  |

Nothing downstream knows which backend produced these. That is the point.

## Codex

`CodexProvider` runs the Codex CLI, which authenticates with your ChatGPT
account from `~/.codex/auth.json`. No API key, no per-token bill.

What it configures per turn:

| Setting                 | Value                          | Why                                        |
| ----------------------- | ------------------------------ | ------------------------------------------ |
| `workingDirectory`      | the bot's workspace            | Its own folder, and where its brief lives  |
| `additionalDirectories` | tools, inbox, shared workspaces | Team tools, dropped files, and what it has been granted |
| `sandboxMode`           | from `agent.workspace.sandbox` | Default `workspace-write`                  |
| `approvalPolicy`        | `never`                        | Nobody is watching a terminal              |
| `skipGitRepoCheck`      | `true`                         | A project folder is not necessarily a repo |

`health()` reads `auth.json` and reports in plain language whether you are
signed in. The app shows that rather than letting a turn fail mysteriously.

### Finding the binary

The SDK can locate its own vendored binary, but only by resolving
`@openai/codex` relative to its own file. Bundled into the Electron main
process that anchor is gone, and it fails with _"Unable to locate Codex CLI
binaries"_. So `locate.ts` finds the binary itself and passes an explicit path,
which makes the SDK skip its own lookup.

It checks, in order: `OPENBOT_CODEX_PATH`, the vendored binary, `PATH`, then
the usual install directories. That last step matters because a GUI app on
macOS does not inherit the shell's `PATH`.

### Available models

A new project names no model, so Codex uses whichever one is set in
`~/.codex/config.toml`. That is the only value guaranteed to work on the
person's plan. Setting `providerOptions.model` overrides it.

Model names are not validated by OpenBot; Codex rejects what it will not run.
Not every model works on a ChatGPT subscription. For example,
`gpt-5.1-codex-mini` returns _"not supported when using Codex with a ChatGPT
account"_. Check `model` in `~/.codex/config.toml` for a value known to work on
your plan.

## Adding a provider

1. Create `packages/core/src/providers/<name>/<name>-provider.ts`.
2. Implement `Provider`. Map your backend's stream onto `ProviderStreamEvent`.
3. Add it to the array in `providers/index.ts`.

4. Set `provider` on a bot, or change `defaults.provider` in `openbot.json`.

`info.options` describes the provider's tunables so the settings UI can render
them without hard-coding anything.

### Skills

Set `supportsSkills: false` and you get a plain chat model. The runtime does
not offer it any skills, and `context.skills` is empty.

To support skills, expose `context.skills` to your backend however it accepts
tools, and call `POST /api/skills/:id/invoke` with the agent id from
`context.skillBridge`. If your backend speaks MCP, point it at
`@openbot/skills-mcp` and you are done. See how `CodexProvider.#buildConfig`
does it.

## EchoProvider

A provider with no dependencies that echoes what you said. Useful for working
on the UI without spending model calls, and for proving that swapping providers
really is a one-line change. Set `"provider": "echo"` on any bot.
