# Tools

A tool is something a bot can do beyond talking. Reading and writing files,
searching, and running commands are **not** OpenBot tools. Codex already has
those. OpenBot's tools are the ones that make a collection of bots into a
team, plus whatever that team has added under `tools/`.

The code still says `Skill`. The interface, the registry, and `agent.json`
keep that word. Everything a person or a bot reads says tool.

## What ships

| Tool                   | What it does                                                 |
| ---------------------- | ------------------------------------------------------------ |
| `list_bots`            | See who is on the team, what they own, and what they may use |
| `hire_bot`             | Create a new colleague; they say hello in their own chat     |
| `change_bot`           | Rename, rebrief, change tools, or pin a colleague            |
| `retire_bot`           | Take a colleague off the team; nothing is deleted            |
| `message_bot`          | Pass work to a colleague; their answer comes back to you     |
| `ask_user`             | Ask the person one question or several, with tappable options |
| `setup_team`           | After the interview: goal, handbook, folders, reference files |
| `share_link`           | Put buttons in the chat that open a file, folder, or page    |
| `look_back`            | Read older messages, by words or by date                     |
| `create_tool`          | Add a tool to this team, or replace one that already exists  |
| `how_to_create_a_tool` | The playbook for writing a team tool, including scripts      |
| `remember`             | Keep something for the whole team; a librarian files it      |
| `recall`               | Search the team notes; one line per note                     |
| `read_notes`           | Open team notes in full, as many as you need in one call     |

## The interface

```ts
export interface Skill<TInput> {
  id: string; // snake_case; this is the tool name the model sees
  title: string;
  description: string; // written for the model, in the same plain language as the UI
  input: z.ZodType<TInput>;
  sensitive?: boolean;
  run(input: TInput, context: SkillContext): Promise<SkillResult>;
}
```

The zod schema is converted to JSON Schema automatically and handed to the
model, so the `.describe()` text on each field is what the model reads. Write
those descriptions for a colleague, not a compiler.

## Adding one

Create a file in `packages/core/src/skills/builtin/`:

```ts
import { z } from 'zod';
import { ok, fail, type Skill } from '../skill.js';

const Input = z.object({
  topic: z.string().min(1).describe('What to look up.'),
});

export const lookUpSkill: Skill<z.infer<typeof Input>> = {
  id: 'look_up',
  title: 'Look something up',
  description: 'Check the team handbook for an answer before asking anyone.',
  input: Input,
  async run(input, ctx) {
    const answer = await search(ctx.host.projectRoot, input.topic);
    return answer ? ok(answer) : fail(`Nothing about "${input.topic}" in the handbook.`);
  },
};
```

Add it to the array in `skills/builtin/index.ts`. That is the whole change.
The MCP bridge picks it up on the next turn, briefs mention it the next time
they are rewritten, and it appears in `GET /api/skills` for the UI.

A builtin is for capabilities every team needs. A playbook or a script that
belongs to one team is a team tool, below.

## Team tools

A team tool lives in the project folder, so it moves with the team.

```
tools/
  send_invoice/
    TOOL.md
    scripts/run.js      optional
    references/         optional extra markdown
```

`TOOL.md` is markdown with a small YAML front matter: `name`, `title`,
`description`, optional `timeout` in seconds, optional `input` fields. The
body is the playbook. If `scripts/run.js` (or `run.sh`, `run.py`, or a
`scripts/run` binary) exists, invoking the tool runs it: JSON on stdin, the
result on stdout, `OPENBOT_PROJECT` in the environment. If there is no
script, the playbook is what the caller gets back.

Every bot has `tools/` mounted, regardless of their other folders. The
runtime reloads the folder when a turn lists tools and after `create_tool`,
so a tool written by hand is live on the next turn.

`how_to_create_a_tool` is itself a team tool, seeded into every new project
and left alone if someone has edited it. `create_tool` is the builtin that
writes a folder and reloads. A team tool cannot take the id of a builtin.

## What a tool can reach

`SkillContext.host` is a narrow interface, not the runtime:

```ts
interface SkillHost {
  projectRoot: string;
  projectName: string;
  listAgents(options?: { includeRetired?: boolean }): AgentDefinition[];
  getAgent(idOrName: string): AgentDefinition | undefined;
  createAgent(request: CreateAgentRequest): Promise<AgentDefinition>;
  updateAgent(id: string, patch: UpdateAgentRequest): Promise<AgentDefinition>;
  listSkills(): SkillInfo[];
  reloadTools(): Promise<void>;
  sendToAgent(options): Promise<string | null>;
  sendToUser(options: { from: string; text: string; cards?: Card[]; waiting?: boolean }): Promise<void>;
  setupTeam(options): Promise<{ goal: string; handbook: boolean; folders: string[]; files: string[] }>;
  workspaceFor(agentId: string): string;
  searchHistory(options): Promise<HistoryHit[]>;
  rememberNote(options: { agentId: string; text: string }): Promise<NoteOutcome>;
  recallNotes(query: NoteQuery): Promise<Note[]>;
  readNotes(ids: number[]): Promise<Note[]>;
  noteTags(): Promise<string[]>;
}
```

Builtin tools stay testable, and they cannot reach into runtime internals.
A team script is the team's own code; treat `tools/` like work you are
willing to run.

## The memory tools

These three are the team's shared memory, and they are deliberately asymmetric.

`recall` is cheap: one line per note, so a bot can afford to check before it
starts anything. It marks the notes that have more than the sentence shown with
a `(+)` and lists their numbers, so a bot never spends a call fetching a body
that was never there. `read_notes` takes all of those numbers at once, because
five notes should be one call and one result, not five of each. `remember` writes nothing directly. It hands the text to a
librarian, which sees every summary already on file and decides whether this is
new, a correction to an existing note, or noise. The verdict comes back inside
the calling bot's turn, so a bot that tries to note its own progress is told
so rather than quietly filtered.

See [What a bot remembers](02-architecture.md#what-a-bot-remembers).

## Setting the team up

`setup_team` is what Setty uses after the interview, before hiring. It sets
the goal (loaded into every brief), writes `memory/handbook.md` (also loaded
into every brief, the same way `AGENTS.md` is), creates folders, and writes
reference files into them. `hire_bot` then has each new bot say hello in
their own chat.

## Permissions

Each bot has an allow-list. `["*"]` means everything; otherwise only the ids
listed. The registry enforces it in `execute()`, so a bot cannot call a tool
by guessing its name. The bridge only ever advertises the tools that bot is
allowed to see.

Mark a builtin `sensitive: true` if it changes the team or reaches the person.
The UI uses that to decide what to surface.

## Cards

A card is an interactive block rendered inline in the chat. Two types ship:
`question` from `ask_user`, and `link` from `share_link`. `ask_user` takes one
question or several. Chips toggle; they can pick more than one and then
Send. Several questions land on one card with a Done button.

`ask_user` produces:

```ts
await ctx.host.sendToUser({
  from: ctx.agent.id,
  text: input.question,
  cards: [
    questionCard(newId('card'), {
      question: input.question,
      options: ['Social posts', 'Email newsletter'],
      allowFreeText: true,
    }),
  ],
});
```

When the person answers, the app `POST`s to
`/api/conversations/:id/answer`. The runtime marks the card answered, so it
stays in the transcript showing what was chosen, then posts the answer as a
normal message, which runs the next turn. From the model's side, the person simply
replied.

### Adding a card type

1. Write the component in
   `apps/desktop/src/renderer/components/cards/`. It receives `{ card, onAnswer }`.
2. Register it in `cards/index.tsx` under its `type`.
3. Build cards with that `type` from a tool.

`Card.props` is deliberately untyped at the boundary so a card can carry
whatever its renderer needs. An app that does not recognise a `type` skips it
rather than breaking, so an older client stays usable against a newer host.
