# Project format

Everything a team owns lives in one folder. Move it, back it up, or put it in
git and the whole team moves with it.

## Layout

```
my-team/
├── openbot.json              the manifest, the source of truth
├── main/                     shared workspace any bot can be given access to
├── memory/                   team notes, written by bots via `remember`
│   └── brand-voice.md
├── agents/
│   └── chief-of-staff/
│       ├── agent.json        this bot's definition
│       └── workspace/        its own folder, where it works
│           └── AGENTS.md     its brief, regenerated from agent.json
└── .openbot/                 runtime state; not hand-edited
    ├── token                 the pairing code (mode 0600)
    ├── conversations.json
    └── messages/
        ├── dm.agt_xxx.jsonl
        └── a2a.agt_xxx.agt_yyy.jsonl
```

`.openbot/` is in the project's `.gitignore`. Everything else is meant to be
readable, diffable, and safe to commit.

## openbot.json

```json
{
  "version": 1,
  "id": "prj_a1b2c3",
  "name": "Bagel Team",
  "createdAt": "2026-08-24T12:00:00.000Z",
  "settings": {
    "port": 7788,
    "bindHost": "127.0.0.1",
    "userName": "You"
  },
  "defaults": {
    "provider": "codex",
    "providerOptions": { "model": "gpt-5.1-codex" },
    "skills": ["*"]
  },
  "agents": [{ "id": "agt_xxx", "slug": "chief-of-staff" }],
  "workspaces": ["main"]
}
```

The manifest lists bots by reference only. Full definitions live in
`agents/<slug>/agent.json`, so hiring a bot touches one small file plus one line
here, and two bots being edited at once cannot clobber each other.

## agent.json

```json
{
  "id": "agt_xxx",
  "slug": "chief-of-staff",
  "name": "Chief of Staff",
  "role": "Runs the team",
  "instructions": "You coordinate. Delegate rather than doing it yourself.",
  "avatar": { "seed": "chief-of-staff", "color": "#4f8ef7" },
  "provider": "codex",
  "providerOptions": { "model": "gpt-5.1-codex", "reasoningEffort": "medium" },
  "workspace": { "shared": ["main"], "sandbox": "workspace-write" },
  "skills": ["*"],
  "createdBy": "user",
  "createdAt": "2026-08-24T12:00:00.000Z",
  "updatedAt": "2026-08-24T12:00:00.000Z",
  "archived": false
}
```

Notes:

- **`slug`** is the folder name and never changes. Renaming a bot does not move
  its work.
- **`avatar.seed`** feeds `react-nice-avatar`, which derives a face
  deterministically. The picture is not stored, only the seed. `config` is
  written only if someone customises the face by hand.
- **`skills`** is an allow-list. `["*"]` means every registered skill.
- **`createdBy`** is `user` or the id of the bot that hired this one.
- **`archived`** hides a bot without deleting its folder or history. OpenBot
  never deletes work.

## AGENTS.md

Regenerated from `agent.json` on every save, into the bot's workspace, so Codex
finds it as the working directory's brief. It is written for the model, not for
you. Edit `instructions` in the app, not this file, or your changes are
overwritten.

The brief is also sent inline on the first turn of a new thread, so behaviour
never depends on file discovery working.

## Message log

One JSONL file per conversation, one message per line, appended as they happen.
A streamed reply is written once when it completes, not on every keystroke.

A torn final line (from a crash mid-write) is skipped on read rather than
failing the load. Losing one message beats losing the conversation.

## Versioning

`version` is checked on load. A project written by a newer OpenBot refuses to
open rather than silently dropping fields it does not understand. Additive
changes do not bump it; anything that changes the meaning of an existing field
does.
