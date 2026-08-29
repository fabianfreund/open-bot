import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { classifyFile, dmConversationId, sendsAsImage } from '@openbot/shared';
import { createProject } from '../project/create-project.js';
import { createLogger } from '../logger.js';
import { OpenBotRuntime } from '../runtime.js';
import { FileStore, FileTooLargeError } from './store.js';
import { turnText, visionPaths } from './prompt.js';
import { ProjectPaths } from '../storage/paths.js';

const dirs: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'openbot-files-'));
  dirs.push(dir);
  await createProject({ root: dir, name: 'Files' });
  return dir;
}

after(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('file kinds', () => {
  it('classifies by extension and mime, unknown becomes file', () => {
    assert.equal(classifyFile({ name: 'logo.PNG' }).id, 'image');
    assert.equal(classifyFile({ name: 'x', mime: 'image/webp' }).id, 'image');
    assert.equal(classifyFile({ name: 'prices.xlsx' }).id, 'spreadsheet');
    assert.equal(classifyFile({ name: 'brief.pdf' }).id, 'pdf');
    assert.equal(classifyFile({ name: 'notes.docx' }).id, 'document');
    assert.equal(classifyFile({ name: 'archive.zip' }).id, 'file');
  });

  it('sends raster images to the provider, not svg', () => {
    assert.equal(sendsAsImage({ name: 'a.png', path: 'inbox/a.png', mime: 'image/png', size: 1, kind: 'image' }), true);
    assert.equal(sendsAsImage({ name: 'a.svg', path: 'inbox/a.svg', mime: 'image/svg+xml', size: 1, kind: 'image' }), false);
    assert.equal(sendsAsImage({ name: 'a.pdf', path: 'inbox/a.pdf', mime: 'application/pdf', size: 1, kind: 'pdf' }), false);
  });
});

describe('file store', () => {
  it('saves into inbox under the original name and suffixes collisions', async () => {
    const root = await tempProject();
    const store = await FileStore.open(new ProjectPaths(root));
    const first = await store.save({ name: 'logo.png', bytes: Buffer.from('one'), mime: 'image/png' });
    const second = await store.save({ name: 'logo.png', bytes: Buffer.from('two'), mime: 'image/png' });

    assert.equal(first.path, 'inbox/logo.png');
    assert.equal(first.kind, 'image');
    assert.equal(second.path, 'inbox/logo-2.png');
    assert.equal(await readFile(path.join(root, first.path), 'utf8'), 'one');
    assert.equal(await readFile(path.join(root, second.path), 'utf8'), 'two');
  });

  it('refuses a path that leaves the project', async () => {
    const root = await tempProject();
    const store = await FileStore.open(new ProjectPaths(root));
    assert.equal(await store.inspect('../secret.txt'), null);
    assert.equal(await store.inspect('.openbot/token'), null);
    assert.equal(await store.read('../../etc/passwd'), null);
  });

  it('rejects a file that is too large', async () => {
    const root = await tempProject();
    const store = await FileStore.open(new ProjectPaths(root));
    await assert.rejects(
      store.save({ name: 'huge.bin', bytes: new Uint8Array(32 * 1024 * 1024 + 1) }),
      FileTooLargeError,
    );
  });
});

describe('turn text', () => {
  it('lists files for the model and collects vision paths', () => {
    const files = [
      { name: 'logo.png', path: 'inbox/logo.png', mime: 'image/png', size: 4, kind: 'image' },
      { name: 'prices.csv', path: 'inbox/prices.csv', mime: 'text/csv', size: 8, kind: 'spreadsheet' },
    ];
    const text = turnText('Look at these', files);
    assert.match(text, /Look at these/);
    assert.match(text, /inbox\/logo\.png/);
    assert.match(text, /inbox\/prices\.csv/);
    assert.deepEqual(visionPaths('/team', files), [path.resolve('/team', 'inbox/logo.png')]);
  });
});

describe('sending files', { concurrency: false }, () => {
  it('keeps the file on the message and tells the bot where it is', async () => {
    const root = await tempProject();
    const runtime = await OpenBotRuntime.open({
      root,
      logger: createLogger('test', 'error'),
    });
    const agent = await runtime.createAgent({
      name: 'Echo',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const saved = await runtime.saveFile({
      name: 'brief.pdf',
      bytes: Buffer.from('%PDF'),
      mime: 'application/pdf',
    });
    const dm = dmConversationId(agent.id);
    const message = await runtime.sendUserMessage(dm, {
      text: 'read this',
      attachments: [saved.path],
    });
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0]?.path, 'inbox/brief.pdf');
    assert.equal(message.body, 'read this');

    await waitUntil('echo reply', async () => {
      const messages = await runtime.messages(dm);
      return messages.some((m) => m.author.kind === 'agent' && m.body.includes('read this'));
    });
    await runtime.close();
  });

  it('creates inbox for an older project that does not have one', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'openbot-files-old-'));
    dirs.push(dir);
    await createProject({ root: dir, name: 'Old' });
    await rm(path.join(dir, 'inbox'), { recursive: true, force: true });
    const runtime = await OpenBotRuntime.open({
      root: dir,
      logger: createLogger('test', 'error'),
    });
    const saved = await runtime.saveFile({ name: 'note.txt', bytes: Buffer.from('hi') });
    assert.equal(saved.path, 'inbox/note.txt');
    await runtime.close();
  });
});

async function waitUntil(label: string, predicate: () => boolean | Promise<boolean>, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${label}`);
}
