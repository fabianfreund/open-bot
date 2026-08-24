import type { FastifyInstance } from 'fastify';
import type { OpenBotRuntime } from '@openbot/core';
import { AnswerCardRequestSchema, SendMessageRequestSchema } from '@openbot/shared';

export async function conversationRoutes(
  app: FastifyInstance,
  runtime: OpenBotRuntime,
): Promise<void> {
  app.get('/api/conversations', async () => runtime.conversations.list());

  /** Resolves (creating if needed) the user's chat with one agent. */
  app.get<{ Params: { id: string } }>('/api/agents/:id/conversation', async (request, reply) => {
    try {
      return await runtime.conversationFor(request.params.id);
    } catch (err) {
      return reply.code(404).send({ error: 'not_found', detail: (err as Error).message });
    }
  });

  app.get<{ Params: { id: string } }>('/api/conversations/:id/messages', async (request) =>
    runtime.messages(request.params.id),
  );

  app.post<{ Params: { id: string } }>('/api/conversations/:id/messages', async (request, reply) => {
    const parsed = SendMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues[0]?.message });
    }
    try {
      const message = await runtime.sendUserMessage(request.params.id, parsed.data);
      return reply.code(201).send(message);
    } catch (err) {
      return reply.code(404).send({ error: 'not_found', detail: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/api/conversations/:id/answer', async (request, reply) => {
    const parsed = AnswerCardRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues[0]?.message });
    }
    try {
      await runtime.answerCard(request.params.id, parsed.data);
      return reply.code(204).send();
    } catch (err) {
      return reply.code(409).send({ error: 'conflict', detail: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/api/conversations/:id/abort', async (request) => ({
    stopped: runtime.abort(request.params.id),
  }));
}
