# Skills

A skill is something a bot can do beyond talking. Reading and writing files,
searching, and running commands are **not** skills. Codex already has those.
OpenBot's skills are the ones that make a collection of bots into a team.

## What ships

| Skill | What it does |
| --- | --- |
| `list_bots` | See who is on the team and what they own |
| `hire_bot` | Create a new colleague |
| `message_bot` | Pass work to a colleague; their answer comes back to the chat |
| `ask_user` | Ask the person a question, with tappable options |
| `remember` | Write a note to `memory/` for the whole team |

## The interface

```ts
export interface Skill<TInput> {
  id: string;              // snake_case; this is the tool name the model sees
  title: string;
  description: string;     // written for the model, in the same plain language as the UI
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
The MCP bridge picks it up on the next turn, and it appears in
`GET /api/skills` for the UI.

## What a skill can reach

`SkillContext.host` is a narrow interface, not the runtime:

```ts
interface SkillHost {
  projectRoot: string;
  projectName: string;
  listAgents(): AgentDefinition[];
  getAgent(idOrName: string): AgentDefinition | undefined;
  createAgent(request: CreateAgentRequest): Promise<AgentDefinition>;
  sendToAgent(options): Promise<string | null>;
  sendToUser(options: { from: string; text: string; cards?: Card[] }): Promise<void>;
  workspaceFor(agentId: string): string;
}
```

Skills stay testable, and they cannot reach into runtime internals.

## Permissions

Each bot has an allow-list. `["*"]` means everything; otherwise only the ids
listed. The registry enforces it in `execute()`, so a bot cannot call a skill
by guessing its name. The bridge only ever advertises the skills that bot is
allowed to see.

Mark a skill `sensitive: true` if it changes the team or reaches the person.
The UI uses that to decide what to surface.

## Cards

A card is an interactive block rendered inline in the chat. Today there is one
type, `question`, which `ask_user` produces:

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
3. Build cards with that `type` from a skill.

`Card.props` is deliberately untyped at the boundary so a card can carry
whatever its renderer needs. An app that does not recognise a `type` skips it
rather than breaking, so an older client stays usable against a newer host.
