import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Logger } from '../logger.js';
import type { NoteStore } from './note-store.js';

/**
 * Brings notes written by older versions of OpenBot into the database.
 *
 * Runs once, when the database is empty and `memory/` still holds loose
 * markdown. The files are moved rather than deleted, so an import that reads a
 * note badly is never the end of it.
 */
export async function importMarkdownNotes(
  memoryDir: string,
  notes: NoteStore,
  log: Logger,
): Promise<number> {
  if (notes.count() > 0) return 0;

  let entries: string[];
  try {
    entries = await fs.readdir(memoryDir);
  } catch {
    return 0;
  }

  const files = entries.filter(
    (name) => name.endsWith('.md') && name !== 'README.md' && name !== 'notes.md',
  );
  if (files.length === 0) return 0;

  const archive = path.join(memoryDir, 'imported');
  await fs.mkdir(archive, { recursive: true });

  let imported = 0;
  for (const name of files) {
    const file = path.join(memoryDir, name);
    try {
      const parsed = parse(await fs.readFile(file, 'utf8'), name);
      await notes.add(
        { summary: parsed.summary, body: parsed.body, tags: [] },
        { id: 'imported', name: parsed.author },
        parsed.writtenAt,
      );
      await fs.rename(file, path.join(archive, name));
      imported += 1;
    } catch (err) {
      log.warn(`could not import memory/${name}`, err);
    }
  }

  log.info(`imported ${imported} team notes into notes.db`);
  return imported;
}

interface ParsedNote {
  summary: string;
  body: string;
  author: string;
  writtenAt: string;
}

/** The old format: `# Title`, the note, then `_Author, YYYY-MM-DD_`. */
function parse(raw: string, fileName: string): ParsedNote {
  const lines = raw.split('\n');
  const heading = lines
    .find((line) => line.startsWith('# '))
    ?.slice(2)
    .trim();
  const signature = /^_(.+?),\s*(\d{4}-\d{2}-\d{2})_$/m.exec(raw);
  const author = signature?.[1]?.trim();
  const day = signature?.[2];

  const body = raw
    .split('\n')
    .filter((line) => !line.startsWith('# ') && !/^_.+,\s*\d{4}-\d{2}-\d{2}_$/.test(line))
    .join('\n')
    .trim();

  const summary = heading || fileName.replace(/\.md$/, '').replace(/-/g, ' ');
  return {
    summary: summary.slice(0, 200),
    body,
    author: author || 'A colleague',
    // The note was written on the day it says, not on the day it was imported.
    writtenAt: day ? `${day}T12:00:00.000Z` : new Date().toISOString(),
  };
}
