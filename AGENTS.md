# Working on OpenBot

Conventions for anyone, human or model, changing this repo.

## Who this is for

OpenBot is used by people who are not developers. Read
[docs/08-design-principles.md](docs/08-design-principles.md) before writing any
user-facing string. The short version: talk about the work, not the machinery,
and never add explaining text to a screen.

## Layout

Dependencies point one way, and nothing goes back up:

```
shared  ->  core  ->  server  ->  desktop
            core  ->  skills-mcp
            shared -> client  ->  desktop
```

`core` has never heard of HTTP. `server` has never heard of Electron. If you
find yourself importing across the grain, the code is in the wrong package.

## Adding things

There are four registries, and almost every feature is one entry in one of
them. See [docs/02-architecture.md](docs/02-architecture.md#extension-points).

Adding a feature should mean one new file plus at most two edited ones. If it
means more, the seam is wrong; fix the seam first.

## House style

- TypeScript, ESM, `.js` extensions on relative imports (NodeNext).
- Small files. One concept per file.
- zod schemas in `@openbot/shared` are the single definition of every shape
  crossing a boundary. Do not hand-write a matching interface.
- Comments explain why, not what. Skip the ones that restate the line.
- No em dashes, in code or prose.
- British or American spelling, but match the file you are in.

## Commands

```bash
pnpm install
pnpm build          # packages only
pnpm typecheck      # packages + desktop
pnpm dev            # build packages, then run the app
pnpm serve <path>   # headless server for a project
```

## Testing a change end to end

There is no test suite yet. Until there is, verify against a real project:

```bash
node -e "…"   # see the scripts in docs, or write a throwaway in /tmp
```

Create a project in `/tmp`, open a runtime, start a server, and drive it over
HTTP. The `echo` provider runs turns without spending model calls; switch a bot
to `"provider": "codex"` when you need to check the real path.

## Dev and built runs differ in one way that matters

Under `pnpm dev` the renderer is served from `http://localhost:5173`, so every
API call is cross-origin and gets a CORS preflight. The built app runs from
`file://` and does not. A change that only works in one of them usually means
CORS. Test both.

## Three things that will waste your afternoon

- **`ELECTRON_RUN_AS_NODE=1`** in your shell makes Electron start as plain
  Node, so `require('electron')` resolves to the npm shim and every Electron
  API is undefined. Unset it before running the app.
- **CORS preflight** must stay exempt from the auth hook in
  `packages/server/src/auth.ts`. Preflights carry no credentials, so guarding
  them makes the whole app look unreachable in dev.
- **Codex model names** are not validated by us. A model your ChatGPT plan
  cannot use fails with a 400 from the API, mid-turn. This is why a new project
  names no model at all. Do not add a default back.
- **Bundling breaks runtime path resolution.** Anything that resolves its own
  location with `require.resolve` or `import.meta.url` is wrong once rolldown
  inlines it into `out/main/index.js`. The Codex SDK does exactly this; see
  `providers/codex/locate.ts`.
