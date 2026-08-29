# Project format

Everything a team owns lives in one folder. Move it, back it up, or put it in
git and the whole team moves with it.

## Layout

```
my-team/
├── openbot.json              the manifest, the source of truth
├── main/                     shared workspace any bot can be given access to
├── inbox/                    files dropped into a chat; bots copy, not move
├── memory/                   the team's shared notes
│   ├── notes.db              the store: dated, tagged, searchable
│   ├── notes.md              readable copy, regenerated on every write
│   └── handbook.md           standing brief, loaded into every bot's AGENTS.md
├── tools/                    team tools, shared with every bot
│   └── create-a-tool/
│       └── TOOL.md           how this team writes a new tool
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
  "archived": false,
  "pinned": false
}
```

Notes:

- **`slug`** is the folder name and never changes. Renaming a bot does not move
  its work.
- **`avatar.seed`** feeds `react-nice-avatar`, which derives a face
  deterministically. The picture is not stored, only the seed. `config` is
  written only if someone customises the face by hand.
- **`skills`** is an allow-list of tool ids. `["*"]` means every registered
  tool, builtin and this team's.
- **`createdBy`** is `user` or the id of the bot that hired this one.
- **`archived`** hides a bot without deleting its folder or history. OpenBot
  never deletes work.
- **`pinned`** keeps them at the top of the list. Setty pins the manager.

## AGENTS.md

Regenerated from `agent.json` on every save, into the bot's workspace, so Codex
finds it as the working directory's brief. It is written for the model, not for
you. Edit `instructions` in the app, not this file, or your changes are
overwritten.

The brief is also sent inline on the first turn of a new thread, so behaviour
never depends on file discovery working.

## Inbox

Files dropped onto a chat land in `inbox/` under their original name
(`logo.png`, then `logo-2.png` if that name is taken). The folder is always
mounted for every bot, like `tools/`. It is not listed in `workspaces`.

The original stays. A bot copies it into a working folder rather than moving
it, so the chat preview still opens.

Images are also handed to the model as pictures on that turn. Everything else
is a path the bot can open: a PDF, a spreadsheet, a document, or any other file.

Adding a new file type is a row in `FILE_KINDS`
(`packages/shared/src/models/file.ts`). A custom preview in the app is
optional; without one it still shows as a named chip.

## Team notes

`memory/notes.db` is a small SQLite database, one row per note:

| Column          | What it is                                             |
| --------------- | ------------------------------------------------------ |
| `id`            | Small integer. What a bot quotes to fetch the body     |
| `created_at`    | ISO timestamp                                          |
| `summary`       | One sentence. What `recall` hands back                 |
| `body`          | The long version, when the sentence left something out |
| `tags`          | `,brand,voice,` so an exact tag filter is one `like`   |
| `author`        | The bot that asked for it to be kept                   |
| `superseded_by` | Set when a later note replaced this one. Never deleted |

An FTS5 index over summary, body, and tags does the searching, weighted so a
hit in the summary beats a hit in the body.

Bots reach it through three tools and never touch the file: `remember`,
`recall`, `read_notes`. See [docs/05-skills.md](05-skills.md).

`notes.md` is regenerated from the database on every write. It exists so the
folder stays readable and diffable; editing it changes nothing.

## Team tools

`tools/<name>/TOOL.md` is a tool this team added. Optional `scripts/` next to
it. See [05-skills.md](05-skills.md#team-tools). The folder is always mounted
for every bot; it is not listed in `workspaces`.

Notes written by an older OpenBot as loose `memory/*.md` files are imported on
first open and moved into `memory/imported/`.

SQLite's `notes.db-wal` and `notes.db-shm` are scratch files and are in the
project's `.gitignore`. `notes.db` itself is meant to be committed. A project
created before this layout will not have those two lines; add them.

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
