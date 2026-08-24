import type { FastifyInstance } from 'fastify';
import type { OpenBotRuntime } from '@openbot/core';
import { InvokeSkillRequestSchema } from '@openbot/shared';

export async function skillRoutes(app: FastifyInstance, runtime: OpenBotRuntime): Promise<void> {
  /**
   * Called by the MCP bridge on an agent's behalf. The agent id comes from the
   * bridge's environment, which only the runtime that spawned it knows.
   */
  app.post<{ Params: { id: string } }>('/api/skills/:id/invoke', async (request, reply) => {
    const parsed = InvokeSkillRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues[0]?.message });
    }
    const { agentId, conversationId, input } = parsed.data;
    return runtime.invokeSkill(request.params.id, agentId, conversationId ?? '', input);
  });
}
