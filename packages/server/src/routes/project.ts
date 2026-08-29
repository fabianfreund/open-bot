import type { FastifyInstance } from 'fastify';
import type { OpenBotRuntime } from '@openbot/core';
import { PROTOCOL_VERSION, UpdateProjectRequestSchema } from '@openbot/shared';

export async function projectRoutes(app: FastifyInstance, runtime: OpenBotRuntime): Promise<void> {
  app.get('/api/health', async () => ({
    ok: true,
    name: 'openbot',
    version: '0.1.0',
    protocol: PROTOCOL_VERSION,
    projectName: runtime.projectName,
  }));

  app.get('/api/project', async () => runtime.info);

  app.patch('/api/project', async (request, reply) => {
    const parsed = UpdateProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'bad_request', detail: parsed.error.issues[0]?.message });
    }
    return runtime.updateProject(parsed.data);
  });

  app.get('/api/providers', async () => ({
    providers: runtime.providers.list(),
    health: await runtime.providers.health(),
  }));

  app.get('/api/skills', async () => {
    await runtime.reloadTools();
    return runtime.skills.list();
  });
}
