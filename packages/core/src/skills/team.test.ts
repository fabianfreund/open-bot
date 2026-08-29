import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { createLogger } from '../logger.js';
import { createProject } from '../project/create-project.js';
import { OpenBotRuntime } from '../runtime.js';
import { HANDBOOK_ID } from './team/handbook.js';
import { parseToolMarkdown, toolIdFromName } from './team/parse.js';

const dirs: string[] = [];

async function openRuntime(): Promise<OpenBotRuntime> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'openbot-tools-'));
  dirs.push(dir);
  await createProject({ root: dir, name: 'Tools' });
  return OpenBotRuntime.open({
    root: dir,
    logger: createLogger('test', 'error'),
  });
}

after(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('team tools', { concurrency: false }, () => {
  it('parses a TOOL.md with fields and a playbook', () => {
    const parsed = parseToolMarkdown(
      `---
name: send_invoice
title: Send an invoice
description: Bill a client.
timeout: 15
input:
  client: Who to bill.
  amount: How much.
---

Call the ledger, then send.
`,
      'ignored',
    );
    assert.equal(parsed?.id, 'send_invoice');
    assert.equal(parsed?.title, 'Send an invoice');
    assert.equal(parsed?.timeoutMs, 15_000);
    assert.deepEqual(parsed?.fields, [
      { name: 'client', description: 'Who to bill.' },
      { name: 'amount', description: 'How much.' },
    ]);
    assert.match(parsed?.body ?? '', /ledger/);
  });

  it('normalises hyphenated names', () => {
    assert.equal(toolIdFromName('send-invoice'), 'send_invoice');
    assert.equal(toolIdFromName('1bad'), null);
  });

  it('seeds the handbook on a new team', async () => {
    const runtime = await openRuntime();
    const ids = runtime.listSkills().map((s) => s.id);
    assert.ok(ids.includes(HANDBOOK_ID));
    assert.ok(ids.includes('create_tool'));
    const text = await readFile(
      path.join(runtime.projectRoot, 'tools', 'create-a-tool', 'TOOL.md'),
      'utf8',
    );
    assert.match(text, /create_tool/);
    await runtime.close();
  });

  it('returns the playbook when a tool has no script', async () => {
    const runtime = await openRuntime();
    const agent = await runtime.createAgent({
      name: 'Scout',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const result = await runtime.invokeSkill(HANDBOOK_ID, agent.id, '', {});
    assert.equal(result.ok, true);
    assert.match(result.content, /When to add one/);
    await runtime.close();
  });

  it('creates a tool with a script and runs it', async () => {
    const runtime = await openRuntime();
    const agent = await runtime.createAgent({
      name: 'Scout',
      role: '',
      instructions: '',
      provider: 'echo',
    });

    const created = await runtime.invokeSkill('create_tool', agent.id, '', {
      name: 'shout',
      title: 'Shout',
      description: 'Uppercase whatever you pass it.',
      instructions: 'The script does the work.',
      fields: [{ name: 'text', description: 'What to shout.' }],
      script: `
        let raw = '';
        process.stdin.on('data', (c) => raw += c);
        process.stdin.on('end', () => {
          const input = JSON.parse(raw || '{}');
          process.stdout.write(String(input.text || '').toUpperCase());
        });
      `,
    });
    assert.equal(created.ok, true);
    assert.ok(runtime.listSkills().some((s) => s.id === 'shout' && s.source === 'team'));

    const shouted = await runtime.invokeSkill('shout', agent.id, '', { text: 'hello' });
    assert.equal(shouted.ok, true);
    assert.equal(shouted.content, 'HELLO');
    await runtime.close();
  });

  it('refuses to shadow a builtin', async () => {
    const runtime = await openRuntime();
    const agent = await runtime.createAgent({
      name: 'Scout',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const result = await runtime.invokeSkill('create_tool', agent.id, '', {
      name: 'hire_bot',
      title: 'Nope',
      description: 'Should fail.',
      instructions: 'Should fail.',
    });
    assert.equal(result.ok, false);
    assert.match(result.content, /built-in/);
    await runtime.close();
  });

  it('picks up a folder written by hand', async () => {
    const runtime = await openRuntime();
    const agent = await runtime.createAgent({
      name: 'Scout',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const dir = path.join(runtime.projectRoot, 'tools', 'hand_made');
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'TOOL.md'),
      `---
name: hand_made
title: Hand made
description: Written without create_tool.
---

You did this by hand.
`,
      'utf8',
    );
    const result = await runtime.invokeSkill('hand_made', agent.id, '', {});
    assert.equal(result.ok, true);
    assert.match(result.content, /by hand/);
    await runtime.close();
  });
});
