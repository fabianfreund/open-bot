import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { OpenBotRuntime } from '@openbot/core';
import { createAuthHook } from './auth.js';
import { agentRoutes } from './routes/agents.js';
import { conversationRoutes } from './routes/conversations.js';
import { projectRoutes } from './routes/project.js';
import { skillRoutes } from './routes/skills.js';
import { registerSocket } from './ws.js';

/** How many ports after the configured one to try before giving up on a number. */
const PORT_ATTEMPTS = 10;

export interface ServerHandle {
  app: FastifyInstance;
  url: string;
  close(): Promise<void>;
}

export interface StartServerOptions {
  runtime: OpenBotRuntime;
  /** Overrides the project's saved port. `0` picks a free one. */
  port?: number;
  /** Overrides the project's saved bind address. */
  host?: string;
}

/**
 * Wraps a runtime in HTTP + WebSocket. The Electron app starts this in-process
 * when it hosts a project; a headless machine starts it from `bin.js`.
 */
export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const { runtime } = options;
  const settings = runtime.info.file.settings;
  const port = options.port ?? settings.port;
  const host = options.host ?? settings.bindHost;

  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 * 1024 });
  await app.register(websocket);

  app.addHook('onRequest', createAuthHook(runtime.token));
  // The desktop renderer and any paired device are separate origins.
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-headers', 'authorization, content-type');
    reply.header('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    return payload;
  });
  app.options('/*', async (_request, reply) => reply.code(204).send());

  await projectRoutes(app, runtime);
  await agentRoutes(app, runtime);
  await conversationRoutes(app, runtime);
  await skillRoutes(app, runtime);
  await registerSocket(app, runtime);

  try {
    await listenWithFallback(app, host, port);
  } catch (err) {
    await app.close();
    throw err;
  }

  const address = app.addresses()[0];
  const resolvedPort = address?.port ?? port;
  // Spawned skill bridges always come back over loopback, even when the
  // server is also listening on a tailnet address.
  const url = `http://127.0.0.1:${resolvedPort}`;
  runtime.setServerUrl(url);

  return {
    app,
    url,
    close: async () => {
      runtime.close();
      await app.close();
    },
  };
}

/**
 * Another team (or a stale instance) may already hold the configured port.
 * Walking to the next free one keeps "New team" from failing on a number,
 * which previously left a project on disk that the app refused to reopen.
 */
async function listenWithFallback(app: FastifyInstance, host: string, port: number): Promise<void> {
  if (port === 0) {
    await app.listen({ port: 0, host });
    return;
  }
  for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt += 1) {
    try {
      await app.listen({ port: port + attempt, host });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    }
  }
  // Every nearby port is taken; let the OS choose one.
  await app.listen({ port: 0, host });
}
