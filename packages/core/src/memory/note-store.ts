import type { DatabaseSync, SQLInputValue, SQLOutputValue } from 'node:sqlite';
import { normaliseTags, type Note, type NoteDraft, type NoteQuery } from '@openbot/shared';
import { openNotesDb } from './db.js';
import { writeMirror } from './mirror.js';

interface Author {
  id: string;
  name: string;
}

/**
 * The team's shared memory. Small on purpose: notes go in one at a time, come
 * out as one-sentence summaries, and only the ones a bot asks for by number
 * carry their body with them.
 *
 * Nothing is ever deleted. Correcting a note writes a new one and points the
 * old one at it, so a decision that changed can still be traced back.
 */
export class NoteStore {
  private constructor(
    readonly db: DatabaseSync,
    private readonly mirrorFile: string,
  ) {}

  static async open(dbFile: string, mirrorFile: string): Promise<NoteStore> {
    const store = new NoteStore(openNotesDb(dbFile), mirrorFile);
    await store.#mirror();
    return store;
  }

  close(): void {
    this.db.close();
  }

  count(): number {
    const row = this.db.prepare('select count(*) as n from notes').get() as { n: number };
    return Number(row.n);
  }

  get(id: number): Note | undefined {
    const row = this.db.prepare('select * from notes where id = ?').get(id);
    return row ? toNote(row) : undefined;
  }

  /**
   * Several notes in one query, in the order they were asked for. Bots read a
   * handful at a time, and a round trip each is a round trip wasted.
   */
  getMany(ids: number[]): Note[] {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return [];
    const rows = this.db
      .prepare(`select * from notes where id in (${wanted.map(() => '?').join(',')})`)
      .all(...wanted);
    const byId = new Map(rows.map(toNote).map((note) => [note.id, note]));
    return wanted.map((id) => byId.get(id)).filter((note): note is Note => note !== undefined);
  }

  /** Every note, superseded ones included. Only the mirror wants this. */
  all(): Note[] {
    return this.db.prepare('select * from notes order by id').all().map(toNote);
  }

  /** Newest live notes, for showing a bot what is already on file. */
  index(limit = 40): Note[] {
    const rows = this.db
      .prepare(
        'select * from notes where superseded_by is null order by created_at desc, id desc limit ?',
      )
      .all(limit);
    return rows.map(toNote);
  }

  /** Every tag in use, most used first. Cheap enough to compute per call. */
  tags(): string[] {
    const counts = new Map<string, number>();
    for (const note of this.index(500)) {
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
  }

  /** `at` is only passed when importing, so an old note keeps its own date. */
  async add(draft: NoteDraft, author: Author, at?: string): Promise<Note> {
    const now = at ?? new Date().toISOString();
    const tags = tagField(draft.tags);
    const result = this.db
      .prepare(
        `insert into notes (created_at, updated_at, summary, body, tags, author, author_id)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(now, now, draft.summary.trim(), draft.body.trim(), tags, author.name, author.id);
    const id = Number(result.lastInsertRowid);
    await this.#mirror();
    return this.get(id)!;
  }

  /**
   * Replaces a note that is no longer right. The new note stands on its own,
   * so a bot reading it never has to chase a chain of edits.
   */
  async supersede(id: number, draft: NoteDraft, author: Author): Promise<Note> {
    const replacement = await this.add(draft, author);
    this.db
      .prepare('update notes set superseded_by = ?, updated_at = ? where id = ?')
      .run(replacement.id, replacement.updatedAt, id);
    await this.#mirror();
    return replacement;
  }

  /**
   * Full-text first, ranked by relevance. Falls back to a plain substring
   * match, because bots search for things the tokeniser does not split the way
   * they expect: a hex colour, a file name, half a product name.
   */
  search(query: NoteQuery): Note[] {
    const filters: string[] = ['n.superseded_by is null'];
    const params: SQLInputValue[] = [];

    for (const tag of normaliseTags(query.tags)) {
      filters.push('n.tags like ?');
      params.push(`%,${tag},%`);
    }
    if (query.since) {
      filters.push('n.created_at >= ?');
      params.push(query.since);
    }
    if (query.until) {
      filters.push("n.created_at < date(?, '+1 day')");
      params.push(query.until);
    }

    const where = filters.join(' and ');
    const text = query.text.trim();

    if (!text) {
      const rows = this.db
        .prepare(
          `select n.* from notes n where ${where} order by n.created_at desc, n.id desc limit ?`,
        )
        .all(...params, query.limit);
      return rows.map(toNote);
    }

    const match = ftsQuery(text);
    let rows: Row[] = [];
    if (match) {
      rows = this.db
        .prepare(
          `select n.* from notes_fts
           join notes n on n.id = notes_fts.rowid
           where notes_fts match ? and ${where}
           order by bm25(notes_fts, 10.0, 1.0, 4.0)
           limit ?`,
        )
        .all(match, ...params, query.limit);
    }
    if (rows.length > 0) return rows.map(toNote);

    const like = `%${text.toLowerCase()}%`;
    rows = this.db
      .prepare(
        `select n.* from notes n
         where ${where} and (lower(n.summary) like ? or lower(n.body) like ?)
         order by n.created_at desc, n.id desc
         limit ?`,
      )
      .all(...params, like, like, query.limit);
    return rows.map(toNote);
  }

  async #mirror(): Promise<void> {
    await writeMirror(this.mirrorFile, this.all());
  }
}

type Row = Record<string, SQLOutputValue>;

function toNote(row: Row): Note {
  return {
    id: Number(row.id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    summary: String(row.summary),
    body: String(row.body ?? ''),
    tags: String(row.tags ?? '')
      .split(',')
      .filter(Boolean),
    author: String(row.author),
    authorId: String(row.author_id),
    supersededBy: row.superseded_by == null ? null : Number(row.superseded_by),
  };
}

/** `,brand,voice,` so an exact tag match is one `like`, not a substring guess. */
function tagField(tags: string[]): string {
  const clean = normaliseTags(tags);
  return clean.length === 0 ? '' : `,${clean.join(',')},`;
}

/**
 * FTS5 has its own query language, and a bot searching for `it's "blue"` would
 * otherwise throw a syntax error at the person. Words only, each quoted, all
 * required.
 */
function ftsQuery(text: string): string {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) return '';
  return words.map((word) => `"${word}"`).join(' ');
}
