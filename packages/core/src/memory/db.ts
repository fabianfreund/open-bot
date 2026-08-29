import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Bumped when the tables change. `pragma user_version` is checked on open, so
 * a project written by an older OpenBot upgrades in place and one written by a
 * newer OpenBot refuses rather than dropping columns it cannot see.
 */
export const NOTES_SCHEMA_VERSION = 1;

/**
 * Opens (and creates) the team's note database.
 *
 * `node:sqlite` ships with Node and with Electron, so this adds no native
 * dependency and nothing to rebuild per platform. It is synchronous by design;
 * at note volume the queries are microseconds and an async wrapper would only
 * hide that.
 */
export function openNotesDb(file: string): DatabaseSync {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // WAL so a read during a write never blocks, and a crash mid-write cannot
  // leave a half-applied note.
  db.exec('pragma journal_mode = wal');
  db.exec('pragma foreign_keys = on');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('pragma user_version').get() as { user_version: number };
  const version = Number(row.user_version ?? 0);

  if (version > NOTES_SCHEMA_VERSION) {
    throw new Error(
      'These team notes were written by a newer version of OpenBot. Update the app to open them.',
    );
  }
  if (version === NOTES_SCHEMA_VERSION) return;

  if (version < 1) db.exec(V1);
  db.exec(`pragma user_version = ${NOTES_SCHEMA_VERSION}`);
}

/**
 * `tags` is stored as `,brand,voice,` on the row rather than in a join table.
 * It makes an exact tag filter one `like`, it feeds the search index for free,
 * and a notes table with a second table hanging off it would be the largest
 * thing in this package for no gain.
 */
const V1 = `
create table notes (
  id            integer primary key autoincrement,
  created_at    text    not null,
  updated_at    text    not null,
  summary       text    not null,
  body          text    not null default '',
  tags          text    not null default '',
  author        text    not null,
  author_id     text    not null,
  superseded_by integer references notes(id)
);

create index notes_by_date on notes (created_at desc);

create virtual table notes_fts using fts5 (
  summary,
  body,
  tags,
  content = 'notes',
  content_rowid = 'id',
  tokenize = 'porter unicode61'
);

create trigger notes_fts_insert after insert on notes begin
  insert into notes_fts (rowid, summary, body, tags)
  values (new.id, new.summary, new.body, new.tags);
end;

create trigger notes_fts_delete after delete on notes begin
  insert into notes_fts (notes_fts, rowid, summary, body, tags)
  values ('delete', old.id, old.summary, old.body, old.tags);
end;

create trigger notes_fts_update after update on notes begin
  insert into notes_fts (notes_fts, rowid, summary, body, tags)
  values ('delete', old.id, old.summary, old.body, old.tags);
  insert into notes_fts (rowid, summary, body, tags)
  values (new.id, new.summary, new.body, new.tags);
end;
`;
