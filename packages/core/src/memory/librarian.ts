import { z } from 'zod';
import type { AgentDefinition, Conversation, Note, NoteDraft, NoteOutcome } from '@openbot/shared';
import type { Logger } from '../logger.js';
import type { ProjectStore } from '../project/project-store.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { NoteStore } from './note-store.js';

/**
 * The calling bot's turn is blocked while this runs, so it is capped. Filing a
 * note is a short read at low effort; anything longer has gone wrong, and a
 * note kept as the bot wrote it beats a chat that sits there.
 */
const TIMEOUT_MS = 60_000;

/** How much of the existing shelf the librarian is shown before it decides. */
const INDEX_LIMIT = 60;

const VerdictSchema = z.object({
  action: z.enum(['keep', 'update', 'skip']),
  /** The note being replaced, when the action is `update`. */
  id: z.number().int().positive().optional(),
  summary: z.string().optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  /** Said back to the bot that asked, when the action is `skip`. */
  reason: z.string().optional(),
});

export interface LibrarianDeps {
  providers: ProviderRegistry;
  project: ProjectStore;
  notes: NoteStore;
  log: Logger;
}

/**
 * The thing between a bot and the note database.
 *
 * Left to themselves, bots write down what they are doing rather than what the
 * team needs to know, and they write it three times. So `remember` does not
 * write anything: it hands the text to a librarian, a one-shot model run with
 * no tools and no memory of its own, which sees every summary already on file
 * and decides whether this is new, a correction, or noise.
 *
 * The bot gets the verdict back in its own turn, so it learns what is worth
 * keeping instead of being quietly filtered.
 */
export class Librarian {
  constructor(private readonly deps: LibrarianDeps) {}

  async file(input: { text: string; author: AgentDefinition }): Promise<NoteOutcome> {
    const author = { id: input.author.id, name: input.author.name };
    const shelf = this.deps.notes.index(INDEX_LIMIT);

    let verdict: z.infer<typeof VerdictSchema> | null = null;
    try {
      verdict = await this.#decide(input.text, input.author.name, shelf);
    } catch (err) {
      this.deps.log.warn('librarian could not decide, keeping the note as written', err);
    }

    // Nothing a bot asked to keep is ever dropped because the librarian failed.
    if (!verdict) {
      return { action: 'kept', note: await this.deps.notes.add(fallback(input.text), author) };
    }

    if (verdict.action === 'skip') {
      return { action: 'skipped', reason: verdict.reason?.trim() || 'Already covered.' };
    }

    const draft = toDraft(verdict, input.text);

    if (verdict.action === 'update' && verdict.id && this.deps.notes.get(verdict.id)) {
      const note = await this.deps.notes.supersede(verdict.id, draft, author);
      return { action: 'updated', note, replaced: verdict.id };
    }
    return { action: 'kept', note: await this.deps.notes.add(draft, author) };
  }

  async #decide(
    text: string,
    authorName: string,
    shelf: Note[],
  ): Promise<z.infer<typeof VerdictSchema> | null> {
    const providerId = this.deps.providers.has(this.deps.project.file.defaults.provider)
      ? this.deps.project.file.defaults.provider
      : 'codex';
    const provider = this.deps.providers.get(providerId);

    const agent = librarianAgent(providerId, this.deps.project.file.defaults.providerOptions);
    const result = await provider.run(
      { text: prompt(text, authorName, shelf, this.deps.project.file.name), images: [] },
      {
        agent,
        conversation: SCRATCH_CONVERSATION,
        workspaceDir: this.deps.project.paths.memoryDir,
        additionalDirs: [],
        projectRoot: this.deps.project.paths.root,
        // No tools and no bridge: it reads what it is given and answers.
        skills: [],
        skillBridge: {
          bridgePath: '',
          serverUrl: '',
          token: '',
          agentId: agent.id,
          conversationId: SCRATCH_CONVERSATION.id,
        },
        history: [],
        emit: () => {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    // The thread is never resumed, so drop the session rather than let one
    // accumulate per note.
    provider.release?.(agent.id);
    return parseVerdict(result.finalText);
  }
}

/**
 * Not a colleague. It is never hired, never appears in `list_bots`, and holds
 * no thread, so a team of three bots is still a team of three bots.
 */
function librarianAgent(
  provider: string,
  providerOptions: Record<string, unknown>,
): AgentDefinition {
  const now = new Date().toISOString();
  return {
    id: 'librarian',
    slug: 'librarian',
    name: 'Librarian',
    role: 'Keeps the team notes',
    instructions: '',
    avatar: { seed: 'librarian', color: '#8a8f98' },
    provider,
    providerOptions: { ...providerOptions, reasoningEffort: 'low', webSearch: false },
    workspace: { shared: [], sandbox: 'read-only' },
    skills: [],
    createdBy: 'user',
    createdAt: now,
    updatedAt: now,
    archived: false,
    pinned: false,
  };
}

/** Providers key their sessions by conversation; this one is thrown away. */
const SCRATCH_CONVERSATION: Conversation = {
  id: 'librarian',
  kind: 'dm',
  title: 'Librarian',
  participants: ['librarian'],
  agentId: 'librarian',
  providerThreads: {},
  createdAt: '1970-01-01T00:00:00.000Z',
  unread: 0,
};

function prompt(text: string, authorName: string, shelf: Note[], projectName: string): string {
  const existing = shelf.length
    ? shelf
        .map((n) => `${n.id}. ${n.createdAt.slice(0, 10)} [${n.tags.join(' ')}] ${n.summary}`)
        .join('\n')
    : '(nothing on file yet)';

  return `You keep the shared notes for a team called "${projectName}". ${authorName} has
just asked for something to be remembered. Decide what happens to it.

Keep it only if someone would still want it in six months:
- a decision, and why it went that way
- something about the client, the product, or the work that is not easy to look up again
- a preference, a rule, or a constraint the team has to work within
- something that went wrong, and what was learned

Do not keep it if:
- a note on file already says it
- it is progress, status, or what someone is about to do next
- it repeats a bot's own brief or the team's stated goal
- it is only true today

If it corrects or replaces a note on file, update that note rather than adding
a second one that disagrees with the first.

Notes already on file:
${existing}

What ${authorName} wants remembered:
"""
${text.trim()}
"""

Answer with one JSON object and nothing else. No prose, no code fence.

{"action":"keep","summary":"...","body":"...","tags":["...","..."]}
{"action":"update","id":12,"summary":"...","body":"...","tags":["..."]}
{"action":"skip","reason":"..."}

- summary: one sentence, under 160 characters, stating the thing itself. Write
  "The client signs off on Fridays", not "A note about the sign-off schedule".
- body: only when the sentence genuinely leaves something out. Otherwise "".
- tags: one to three, lowercase, single words where you can.
- reason: one short sentence said back to ${authorName}, naming the note that
  already covers it if there is one.`;
}

function parseVerdict(raw: string): z.infer<typeof VerdictSchema> | null {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = VerdictSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function toDraft(verdict: z.infer<typeof VerdictSchema>, original: string): NoteDraft {
  const summary = verdict.summary?.trim();
  if (!summary) return fallback(original);
  return {
    summary: summary.slice(0, 200),
    body: verdict.body?.trim() ?? '',
    tags: (verdict.tags ?? []).slice(0, 6),
  };
}

/** When the librarian is unavailable, the bot's own words become the note. */
function fallback(text: string): NoteDraft {
  const clean = text.replace(/\s+/g, ' ').trim();
  const summary = /^(.{1,200}?[.!?])(\s|$)/.exec(clean)?.[1] ?? clean.slice(0, 200);
  return { summary, body: clean.slice(summary.length).trim(), tags: [] };
}
