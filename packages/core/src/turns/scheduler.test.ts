import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TurnScheduler } from './scheduler.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('TurnScheduler', () => {
  it('runs two chats for the same bot one after the other', async () => {
    const scheduler = new TurnScheduler();
    const order: number[] = [];
    const first = scheduler.enqueue('dm-a', 'agt-a', async () => {
      order.push(1);
      await delay(40);
      order.push(2);
    });
    const second = scheduler.enqueue('channel-a', 'agt-a', async () => {
      order.push(3);
    });
    await Promise.all([first, second]);
    assert.deepEqual(order, [1, 2, 3]);
  });

  it('lets two different bots run at the same time', async () => {
    const scheduler = new TurnScheduler();
    let bFinishedFirst = false;
    const a = scheduler.enqueue('dm-a', 'agt-a', async () => {
      await delay(40);
    });
    const b = scheduler.enqueue('dm-b', 'agt-b', async () => {
      bFinishedFirst = true;
    });
    await b;
    assert.equal(bFinishedFirst, true);
    await a;
  });

  it('drops queued work after abort', async () => {
    const scheduler = new TurnScheduler();
    const controller = await scheduler.begin({
      conversationId: 'dm-a',
      agentId: 'agt-a',
      depth: 0,
      epoch: 0,
    });
    assert.ok(controller);

    let ran = false;
    const epoch = scheduler.epoch('dm-a');
    const queued = scheduler.enqueue('dm-a', 'agt-a', async () => {
      const next = await scheduler.begin({
        conversationId: 'dm-a',
        agentId: 'agt-a',
        depth: 0,
        epoch,
      });
      ran = Boolean(next);
      if (next) scheduler.end('dm-a');
    });

    scheduler.abort('dm-a', 'agt-a');
    scheduler.end('dm-a');
    await queued;
    assert.equal(ran, false);
    await scheduler.close();
  });
});
