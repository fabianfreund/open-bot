import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Note } from '@openbot/shared';

const HEADER = `# Team notes

Generated from \`notes.db\`. Bots write here with \`remember\` and read with
\`recall\`. Edits to this file are overwritten; change a note through the team.
`;

/**
 * The database is the store, this is the copy a person can read.
 *
 * Everything outside `.openbot/` is meant to be readable and diffable, and a
 * SQLite file is neither, so every write rewrites this alongside it. Same
 * one-way relationship as `AGENTS.md` and `agent.json`: one source of truth,
 * one generated view of it.
 */
export function renderNotes(notes: Note[]): string {
  if (notes.length === 0) return `${HEADER}\nNothing yet.\n`;

  const blocks = notes.map((note) => {
    const meta = [note.createdAt.slice(0, 10), note.author, note.tags.join(', ')]
      .filter(Boolean)
      .join(' · ');
    const superseded = note.supersededBy ? `\n\nReplaced by note ${note.supersededBy}.` : '';
    const body = note.body.trim() ? `\n\n${note.body.trim()}` : '';
    return `## ${note.id}. ${note.summary}\n\n${meta}${body}${superseded}`;
  });

  return `${HEADER}\n${blocks.join('\n\n')}\n`;
}

export async function writeMirror(file: string, notes: Note[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, renderNotes(notes), 'utf8');
  await fs.rename(tmp, file);
}
