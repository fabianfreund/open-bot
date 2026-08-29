import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { dmConversationId } from '@openbot/shared';
import { createLogger } from '../logger.js';
import { createProject } from '../project/create-project.js';
import { OpenBotRuntime } from '../runtime.js';

const dirs: string[] = [];

async function openRuntime(): Promise<OpenBotRuntime> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'openbot-onboard-'));
  dirs.push(dir);
  await createProject({ root: dir, name: 'Onboard' });
  return OpenBotRuntime.open({
    root: dir,
    logger: createLogger('test', 'error'),
  });
}

after(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('onboarding', { concurrency: false }, () => {
  it('Setty asks what this is about before any model runs', async () => {
    const runtime = await openRuntime();
    await runtime.ensureOnboarding();
    const setty = runtime.listAgents()[0];
    assert.equal(setty?.name, 'Setty');
    const messages = await runtime.messages(dmConversationId(setty!.id));
    assert.match(messages[0]?.body ?? '', /What is this about/);
    const card = messages[0]?.cards[0];
    assert.equal(card?.type, 'question');
    await runtime.close();
  });

  it('ask_user can put several questions on one card', async () => {
    const runtime = await openRuntime();
    const agent = await runtime.createAgent({
      name: 'Scout',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const result = await runtime.invokeSkill('ask_user', agent.id, '', {
      intro: 'Thanks. A few things would help.',
      questions: [
        { question: "What's your website?", options: ["I don't have one"], allowFreeText: true },
        {
          question: 'Where do you post?',
          options: ['Instagram', 'LinkedIn', 'X'],
          allowMultiple: true,
        },
      ],
    });
    assert.equal(result.ok, true);
    const messages = await runtime.messages(dmConversationId(agent.id));
    const last = messages.at(-1);
    assert.match(last?.body ?? '', /few things would help/);
    const questions = (last?.cards[0]?.props as { questions?: { question: string }[] }).questions;
    assert.equal(questions?.length, 2);
    await runtime.close();
  });

  it('setup_team writes a goal, handbook, folders, and files the briefs load', async () => {
    const runtime = await openRuntime();
    const setty = await runtime.createAgent({
      name: 'Setty',
      role: 'Sets up the team',
      instructions: '',
      provider: 'echo',
      sharedWorkspaces: ['main'],
    });
    const result = await runtime.invokeSkill('setup_team', setty.id, '', {
      goal: 'Plan and write social posts.',
      handbook: 'Voice is plain and short. Read main/voice.md before writing.',
      folders: ['content'],
      files: [{ path: 'main/voice.md', content: 'No jargon. No hashtags unless asked.' }],
    });
    assert.equal(result.ok, true);
    assert.equal(runtime.info.file.goal, 'Plan and write social posts.');
    assert.match(
      await readFile(path.join(runtime.projectRoot, 'memory', 'handbook.md'), 'utf8'),
      /Voice is plain/,
    );
    assert.match(
      await readFile(path.join(runtime.projectRoot, 'main', 'voice.md'), 'utf8'),
      /No jargon/,
    );
    const brief = await readFile(
      path.join(runtime.projectRoot, 'agents', setty.slug, 'workspace', 'AGENTS.md'),
      'utf8',
    );
    assert.match(brief, /Plan and write social posts/);
    assert.match(brief, /## Team handbook/);
    assert.match(brief, /main\/voice.md/);
    const updated = runtime.getAgent(setty.id);
    assert.ok(updated?.workspace.shared.includes('content'));
    await runtime.close();
  });

  it('a hired bot says hello in their own chat', async () => {
    const runtime = await openRuntime();
    const setty = await runtime.createAgent({
      name: 'Setty',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const hired = await runtime.invokeSkill('hire_bot', setty.id, '', {
      name: 'Scout',
      role: 'Finds stories and writes them up',
      instructions: 'Research first.',
      intro: "Hi, I'm Scout. I find stories and write them up. Send me a topic.",
    });
    assert.equal(hired.ok, true);
    const scout = runtime.getAgent('Scout');
    assert.ok(scout);
    const messages = await runtime.messages(dmConversationId(scout.id));
    assert.match(messages[0]?.body ?? '', /I'm Scout/);
    assert.equal(messages[0]?.author.id, scout.id);
    await runtime.close();
  });

  it('hire_bot can pin a manager at the top of the list', async () => {
    const runtime = await openRuntime();
    const setty = await runtime.createAgent({
      name: 'Setty',
      role: '',
      instructions: '',
      provider: 'echo',
    });
    const hired = await runtime.invokeSkill('hire_bot', setty.id, '', {
      name: 'Morgan',
      role: 'Runs the work with you',
      instructions: 'You are the manager.',
      pinned: true,
    });
    assert.equal(hired.ok, true);
    const morgan = runtime.getAgent('Morgan');
    assert.equal(morgan?.pinned, true);

    const unpinned = await runtime.invokeSkill('change_bot', setty.id, '', {
      bot: 'Morgan',
      pinned: false,
    });
    assert.equal(unpinned.ok, true);
    assert.equal(runtime.getAgent('Morgan')?.pinned, false);
    await runtime.close();
  });
});
