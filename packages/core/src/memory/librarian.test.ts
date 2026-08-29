import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ProviderHealth, ProviderInfo } from '@openbot/shared';
import { createLogger } from '../logger.js';
import { createProject } from '../project/create-project.js';
import { ProjectStore } from '../project/project-store.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { Provider, ProviderRunResult } from '../providers/provider.js';
import { Librarian } from './librarian.js';
import { NoteStore } from './note-store.js';

/** Stands in for a model: answers with whatever the test queued. */
class StubProvider implements Provider {
  readonly info: ProviderInfo = {
    id: 'stub',
    label: 'Stub',
    description: 'Answers with a canned verdict.',
    supportsSkills: false,
    options: [],
  };
  replies: string[] = [];
  prompts: string[] = [];

  async run(input: { text: string }): Promise<ProviderRunResult> {
    this.prompts.push(input.text);
    return { finalText: this.replies.shift() ?? '' };
  }
  async health(): Promise<ProviderHealth> {
    return { id: this.info.id, ok: true, detail: 'Always available.' };
  }
}

const author = {
  id: 'agt_scout',
  slug: 'scout',
  name: 'Scout',
  role: '',
  instructions: '',
  avatar: { seed: 'scout', color: '#000000' },
  provider: 'stub',
  providerOptions: {},
  workspace: { shared: [], sandbox: 'read-only' as const },
  skills: ['*'],
  createdBy: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archived: false,
  pinned: false,
};

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openbot-librarian-'));
  await createProject({ root: path.join(root, 'team'), name: 'Bagel Team' });
  const project = await ProjectStore.load(path.join(root, 'team'));
  await project.update((file) => {
    file.defaults.provider = 'stub';
  });
  const notes = await NoteStore.open(project.paths.notesDb, project.paths.notesFile);
  const providers = new ProviderRegistry();
  const stub = new StubProvider();
  providers.register(stub);
  const librarian = new Librarian({ providers, project, notes, log: createLogger('test') });
  return { librarian, notes, stub };
}

test('a verdict of keep files the librarian’s wording, not the bot’s', async () => {
  const { librarian, notes, stub } = await setup();
  stub.replies.push(
    '{"action":"keep","summary":"The client signs off on Fridays.","body":"","tags":["Client","process"]}',
  );

  const outcome = await librarian.file({
    text: 'so i noticed today that basically the client only ever signs things off on a friday',
    author,
  });

  assert.equal(outcome.action, 'kept');
  assert.equal(
    outcome.action === 'kept' && outcome.note.summary,
    'The client signs off on Fridays.',
  );
  assert.deepEqual(outcome.action === 'kept' && outcome.note.tags, ['client', 'process']);
  assert.equal(notes.count(), 1);
  notes.close();
});

test('a verdict of skip writes nothing and says why', async () => {
  const { librarian, notes, stub } = await setup();
  stub.replies.push('{"action":"skip","reason":"Note 3 already says this."}');

  const outcome = await librarian.file({ text: 'I am about to start the deck', author });

  assert.deepEqual(outcome, { action: 'skipped', reason: 'Note 3 already says this.' });
  assert.equal(notes.count(), 0);
  notes.close();
});

test('a verdict of update replaces the note it names', async () => {
  const { librarian, notes, stub } = await setup();
  const old = await notes.add({ summary: 'The blue is #000000.', body: '', tags: [] }, author);
  stub.replies.push(
    `{"action":"update","id":${old.id},"summary":"The blue is #4f8ef7.","body":"","tags":["brand"]}`,
  );

  const outcome = await librarian.file({ text: 'the blue changed to #4f8ef7', author });

  assert.equal(outcome.action, 'updated');
  assert.equal(notes.get(old.id)?.supersededBy, outcome.action === 'updated' ? outcome.note.id : 0);
  assert.equal(notes.search({ text: 'blue', tags: [], limit: 12 }).length, 1);
  notes.close();
});

test('the librarian is shown what is already on file', async () => {
  const { librarian, notes, stub } = await setup();
  await notes.add({ summary: 'Invoices go out on the first.', body: '', tags: ['money'] }, author);
  stub.replies.push('{"action":"skip","reason":"Covered."}');

  await librarian.file({ text: 'invoices go out at the start of the month', author });

  assert.match(stub.prompts[0]!, /Invoices go out on the first\./);
  assert.match(stub.prompts[0]!, /\[money\]/);
  notes.close();
});

test('an answer that is not a verdict keeps the note rather than losing it', async () => {
  const { librarian, notes, stub } = await setup();
  stub.replies.push('Sure, I have filed that for you!');

  const outcome = await librarian.file({
    text: 'The client signs off on Fridays. Anything sent Thursday night waits.',
    author,
  });

  assert.equal(outcome.action, 'kept');
  assert.equal(
    outcome.action === 'kept' && outcome.note.summary,
    'The client signs off on Fridays.',
  );
  assert.equal(
    outcome.action === 'kept' && outcome.note.body,
    'Anything sent Thursday night waits.',
  );
  notes.close();
});

test('a verdict wrapped in a code fence still parses', async () => {
  const { librarian, notes, stub } = await setup();
  stub.replies.push('```json\n{"action":"keep","summary":"Ship on Tuesdays.","tags":[]}\n```');

  const outcome = await librarian.file({ text: 'we ship on tuesdays', author });

  assert.equal(outcome.action === 'kept' && outcome.note.summary, 'Ship on Tuesdays.');
  notes.close();
});
