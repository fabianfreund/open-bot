import type { FastifyInstance } from 'fastify';
import type { OpenBotRuntime } from '@openbot/core';
import { CreateAgentRequestSchema, UpdateAgentRequestSchema } from '@openbot/shared';

export async function agentRoutes(app: FastifyInstance, runtime: OpenBotRuntime): Promise<void> {
  app.get('/api/agents', async () => runtime.agentViews());

  app.post('/api/agents', async (request, reply) => {
    const parsed = CreateAgentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'bad_request', detail: parsed.error.issues[0]?.message });
    }
    const agent = await runtime.createAgent(parsed.data);
    const conversation = await runtime.conversationFor(agent.id);
    return reply.code(201).send({ agent, conversationId: conversation.id });
  });

  app.patch<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const parsed = UpdateAgentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'bad_request', detail: parsed.error.issues[0]?.message });
    }
    try {
      return await runtime.updateAgent(request.params.id, parsed.data);
    } catch (err) {
      return reply.code(404).send({ error: 'not_found', detail: (err as Error).message });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    try {
      await runtime.updateAgent(request.params.id, { archived: true });
      return reply.code(204).send();
    } catch (err) {
      return reply.code(404).send({ error: 'not_found', detail: (err as Error).message });
    }
  });

  /** The bridge asks which skills this agent is allowed to use. */
  app.get<{ Params: { id: string } }>('/api/agents/:id/skills', async (request, reply) => {
    const agent = runtime.getAgent(request.params.id);
    if (!agent) return reply.code(404).send({ error: 'not_found' });
    await runtime.reloadTools();
    return runtime.skills.forAgent(agent);
  });
}
