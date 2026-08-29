import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { dmConversationId } from '@openbot/shared';
import { createProject } from '../project/create-project.js';
import { createLogger } from '../logger.js';
import type { Provider, ProviderContext, ProviderRunInput } from '../providers/provider.js';
import { OpenBotRuntime } from '../runtime.js';

const hangings = new Set<string>();
const dirs: string[] = [];

const hangProvider: Provider = {
  info: {
    id: 'hang',
    label: 'Hang',
    description: 'Waits until aborted',
    supportsSkills: false,
    options: [],
  },
  async run(_input: ProviderRunInput, context: ProviderContext) {
    hangings.add(context.agent.id);
    context.emit({ kind: 'status', status: 'thinking' });
    try {
      await new Promise<void>((resolve) => {
        if (context.signal.aborted) {
          resolve();
          return;
        }
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    } finally {
      hangings.delete(context.agent.id);
    }
    return { finalText: '' };
  },
  async health() {
    return { id: 'hang', ok: true, detail: 'Always available.' };
  },
};

const boomProvider: Provider = {
  info: {
    id: 'boom',
    label: 'Boom',
    description: 'Always fails',
    supportsSkills: false,
    options: [],
  },
  async run() {
    throw new Error('the cupboard was empty');
  },
  async health() {
    return { id: 'boom', ok: true, detail: 'Always fails.' };
  },
};

async function openRuntime(): Promise<OpenBotRuntime> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'openbot-flow-'));
  dirs.push(dir);
  await createProject({ root: dir, name: 'Flow' });
  const runtime = await OpenBotRuntime.open({
    root: dir,
    logger: createLogger('test', 'error'),
  });
  runtime.providers.register(hangProvider);
  runtime.providers.register(boomProvider);
  return runtime;
}

function statusOf(runtime: OpenBotRuntime, id: string) {
  return runtime.agentViews().find((a) => a.definition.id === id)?.status;
}

async function waitUntil(label: string, predicate: () => boolean | Promise<boolean>, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${label}`);
}

after(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('turn flow', { concurrency: false }, () => {
  it('echoes a user message and writes a brief from the skill registry', async () => {
    const runtime = await openRuntime();
    const agent = await runtime.createAgent({
      name: 'Echo',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const dm = dmConversationId(agent.id);
    await runtime.sendUserMessage(dm, { text: 'hello there' });
    await waitUntil('echo reply', async () => {
      const messages = await runtime.messages(dm);
      return messages.some((m) => m.author.kind === 'agent' && m.body.includes('hello there'));
    });

    const brief = await readFile(
      path.join(runtime.projectRoot, 'agents', agent.slug, 'workspace', 'AGENTS.md'),
      'utf8',
    );
    assert.match(brief, /`look_back`/);
    assert.match(brief, /`message_bot`/);
    await runtime.close();
  });

  it('wakes the asking bot when a colleague fails', async () => {
    const runtime = await openRuntime();
    const asker = await runtime.createAgent({
      name: 'Asker',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const helper = await runtime.createAgent({
      name: 'Helper',
      role: '',
      instructions: '',
      provider: 'boom',
    });
    const dm = dmConversationId(asker.id);
    await runtime.sendUserMessage(dm, { text: 'please ask' });
    await waitUntil('first reply', async () => (await runtime.messages(dm)).length >= 2);

    await runtime.sendToAgent({
      from: asker.id,
      to: helper.id,
      text: 'need a thing',
      originConversationId: dm,
      wait: false,
    });

    await waitUntil('failure wake', async () => {
      const messages = await runtime.messages(dm);
      return messages.some(
        (m) => m.author.id === asker.id && m.body.includes('could not finish what you asked'),
      );
    });
    await runtime.close();
  });

  it('a helper works in its own chat and never writes in the asker’s', async () => {
    const runtime = await openRuntime();
    const asker = await runtime.createAgent({
      name: 'Asker',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const helper = await runtime.createAgent({
      name: 'Helper',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const dmAsker = dmConversationId(asker.id);
    const dmHelper = dmConversationId(helper.id);

    await runtime.sendUserMessage(dmAsker, { text: 'please ask' });
    await waitUntil('first reply', async () => (await runtime.messages(dmAsker)).length >= 2);

    await runtime.sendToAgent({
      from: asker.id,
      to: helper.id,
      text: 'need a thing',
      originConversationId: dmAsker,
      wait: false,
    });

    await waitUntil('helper spoke in its own chat', async () => {
      const messages = await runtime.messages(dmHelper);
      return messages.some((m) => m.author.id === helper.id && m.body.includes('need a thing'));
    });
    await waitUntil('asker woke in its own chat', async () => {
      const messages = await runtime.messages(dmAsker);
      return messages.some((m) => m.author.id === asker.id && m.body.includes('Helper'));
    });

    const askerAuthors = (await runtime.messages(dmAsker)).map((m) => m.author.id);
    assert.equal(
      askerAuthors.some((id) => id === helper.id),
      false,
    );
    const helperAuthors = (await runtime.messages(dmHelper)).map((m) => m.author.id);
    assert.equal(
      helperAuthors.some((id) => id === asker.id),
      false,
    );
    await assert.rejects(
      () =>
        runtime.conversations.append({
          conversationId: dmAsker,
          author: { kind: 'agent', id: helper.id, name: helper.name },
          body: 'sneaking in',
          parts: [],
          cards: [],
          streaming: false,
        }),
      /cannot write/,
    );
    await runtime.close();
  });

  it('abort stops the bot and the colleague it asked', async () => {
    const runtime = await openRuntime();
    const a = await runtime.createAgent({
      name: 'Alpha',
      role: '',
      instructions: '',
      provider: 'hang',
    });
    const b = await runtime.createAgent({
      name: 'Beta',
      role: '',
      instructions: '',
      provider: 'hang',
    });
    const dmA = dmConversationId(a.id);

    await runtime.sendUserMessage(dmA, { text: 'go' });
    await waitUntil('Alpha thinking', () => statusOf(runtime, a.id) === 'thinking');

    await runtime.sendToAgent({
      from: a.id,
      to: b.id,
      text: 'help',
      originConversationId: dmA,
      wait: false,
    });
    await waitUntil('Beta thinking', () => statusOf(runtime, b.id) === 'thinking');

    assert.equal(runtime.abort(dmA), true);
    await waitUntil('both stopped', () => hangings.size === 0);
    await runtime.close();
  });
});
