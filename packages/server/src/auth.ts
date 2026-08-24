import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * One shared token per project. It is generated on first run and shown in the
 * app so another device can pair. Everything except `/api/health` needs it.
 */
export function createAuthHook(token: string) {
  return async function requireToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // A CORS preflight never carries credentials, by design. Rejecting it
    // fails the real request before it is ever sent, which looks to the app
    // like the host is unreachable.
    if (request.method === 'OPTIONS') return;
    if (request.url.startsWith('/api/health')) return;
    if (!request.url.startsWith('/api')) return;
    if (readToken(request) === token) return;
    await reply.code(401).send({ error: 'unauthorized' });
  };
}

export function readToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const query = (request.query as Record<string, unknown> | undefined)?.token;
  return typeof query === 'string' ? query : undefined;
}
