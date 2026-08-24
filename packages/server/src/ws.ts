import type { FastifyInstance } from 'fastify';
import type { OpenBotRuntime } from '@openbot/core';
import { PROTOCOL_VERSION, type ServerEvent } from '@openbot/shared';
import { readToken } from './auth.js';

/**
 * One socket per client carrying the whole `ServerEvent` union. Clients load
 * state over REST, then follow the stream, no per-feature channels.
 */
export async function registerSocket(app: FastifyInstance, runtime: OpenBotRuntime): Promise<void> {
  app.get('/ws', { websocket: true }, (socket, request) => {
    if (readToken(request) !== runtime.token) {
      socket.close(4401, 'unauthorized');
      return;
    }

    const send = (event: ServerEvent) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };

    send({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      project: runtime.info,
      agents: runtime.agentViews(),
    });

    const unsubscribe = runtime.bus.subscribe(send);
    const heartbeat = setInterval(() => {
      if (socket.readyState === socket.OPEN) socket.ping();
    }, 30_000);

    socket.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
