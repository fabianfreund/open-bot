import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NoteStore } from './note-store.js';
import { renderNotes } from './mirror.js';

const author = { id: 'agt_test', name: 'Scout' };

async function store(): Promise<{ notes: NoteStore; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openbot-notes-'));
  const notes = await NoteStore.open(path.join(dir, 'notes.db'), path.join(dir, 'notes.md'));
  return { notes, dir };
}

test('a note comes back by its words', async () => {
  const { notes } = await store();
  await notes.add({ summary: 'The brand blue is #4f8ef7.', body: '', tags: ['brand'] }, author);
  await notes.add({ summary: 'Invoices go out on the first.', body: '', tags: ['money'] }, author);

  const hits = notes.search({ text: 'brand blue', tags: [], limit: 12 });
  assert.equal(hits.length, 1);
  assert.match(hits[0]!.summary, /#4f8ef7/);
  notes.close();
});

test('search falls back to a substring when the tokeniser misses', async () => {
  const { notes } = await store();
  await notes.add({ summary: 'The brand blue is #4f8ef7.', body: '', tags: ['brand'] }, author);

  const hits = notes.search({ text: '#4f8ef7', tags: [], limit: 12 });
  assert.equal(hits.length, 1);
  notes.close();
});

test('tags are normalised and filter exactly', async () => {
  const { notes } = await store();
  await notes.add({ summary: 'Ship on Fridays.', body: '', tags: ['Release Process'] }, author);
  await notes.add({ summary: 'Never ship on Fridays.', body: '', tags: ['release'] }, author);

  const kept = notes.search({ text: '', tags: ['release-process'], limit: 12 });
  assert.deepEqual(
    kept.map((n) => n.summary),
    ['Ship on Fridays.'],
  );
  assert.deepEqual(notes.search({ text: '', tags: ['release'], limit: 12 }).length, 1);
  notes.close();
});

test('superseding hides the old note without deleting it', async () => {
  const { notes } = await store();
  const first = await notes.add({ summary: 'The blue is #000000.', body: '', tags: [] }, author);
  const second = await notes.supersede(
    first.id,
    { summary: 'The blue is #4f8ef7.', body: '', tags: [] },
    author,
  );

  const hits = notes.search({ text: 'blue', tags: [], limit: 12 });
  assert.deepEqual(
    hits.map((n) => n.id),
    [second.id],
  );
  assert.equal(notes.get(first.id)?.supersededBy, second.id);
  assert.equal(notes.count(), 2);
  notes.close();
});

test('date bounds are inclusive of the last day', async () => {
  const { notes } = await store();
  const note = await notes.add({ summary: 'Something happened.', body: '', tags: [] }, author);
  const today = note.createdAt.slice(0, 10);

  assert.equal(
    notes.search({ text: '', tags: [], since: today, until: today, limit: 12 }).length,
    1,
  );
  assert.equal(notes.search({ text: '', tags: [], until: '2000-01-01', limit: 12 }).length, 0);
  notes.close();
});

test('several notes come back in one query, in the order asked for', async () => {
  const { notes } = await store();
  const a = await notes.add({ summary: 'First.', body: '', tags: [] }, author);
  const b = await notes.add({ summary: 'Second.', body: '', tags: [] }, author);
  const c = await notes.add({ summary: 'Third.', body: '', tags: [] }, author);

  assert.deepEqual(
    notes.getMany([c.id, a.id, b.id]).map((n) => n.summary),
    ['Third.', 'First.', 'Second.'],
  );
  notes.close();
});

test('a number nobody wrote is skipped, not thrown', async () => {
  const { notes } = await store();
  const only = await notes.add({ summary: 'The only one.', body: '', tags: [] }, author);

  assert.deepEqual(
    notes.getMany([only.id, 404, only.id]).map((n) => n.id),
    [only.id],
  );
  assert.deepEqual(notes.getMany([]), []);
  notes.close();
});

test('the markdown mirror is rewritten on every write', async () => {
  const { notes, dir } = await store();
  await notes.add(
    { summary: 'Keep the copy readable.', body: 'And diffable.', tags: ['docs'] },
    author,
  );

  const mirror = await fs.readFile(path.join(dir, 'notes.md'), 'utf8');
  assert.match(mirror, /Keep the copy readable\./);
  assert.match(mirror, /And diffable\./);
  assert.match(mirror, /Scout/);
  notes.close();
});

test('an empty shelf still renders', () => {
  assert.match(renderNotes([]), /Nothing yet\./);
});
