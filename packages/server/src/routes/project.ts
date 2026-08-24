import type { FastifyInstance } from 'fastify';
import type { OpenBotRuntime } from '@openbot/core';
import { PROTOCOL_VERSION } from '@openbot/shared';

export async function projectRoutes(app: FastifyInstance, runtime: OpenBotRuntime): Promise<void> {
  app.get('/api/health', async () => ({
    ok: true,
    name: 'openbot',
    version: '0.1.0',
    protocol: PROTOCOL_VERSION,
    projectName: runtime.projectName,
  }));

  app.get('/api/project', async () => runtime.info);

  app.get('/api/providers', async () => ({
    providers: runtime.providers.list(),
    health: await runtime.providers.health(),
  }));

  app.get('/api/skills', async () => runtime.skills.list());
}
