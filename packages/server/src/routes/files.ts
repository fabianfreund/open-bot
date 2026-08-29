import type { FastifyInstance } from 'fastify';
import { FileTooLargeError, type OpenBotRuntime } from '@openbot/core';
import { MAX_FILE_BYTES } from '@openbot/shared';

export async function fileRoutes(app: FastifyInstance, runtime: OpenBotRuntime): Promise<void> {
  app.post('/api/files', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'bad_request', detail: 'Nothing to send.' });
    }
    try {
      const bytes = await file.toBuffer();
      const attachment = await runtime.saveFile({
        name: file.filename || 'file',
        bytes,
        mime: file.mimetype,
      });
      return reply.code(201).send(attachment);
    } catch (err) {
      if (err instanceof FileTooLargeError || isTooLarge(err)) {
        return reply.code(413).send({ error: 'too_large', detail: 'That file is too large.' });
      }
      throw err;
    }
  });

  app.get('/api/files', async (request, reply) => {
    const rel = (request.query as { path?: string }).path;
    if (!rel) {
      return reply.code(400).send({ error: 'bad_request', detail: 'That file is not there any more.' });
    }
    const result = await runtime.readFile(rel);
    if (!result) {
      return reply.code(404).send({ error: 'not_found', detail: 'That file is not there any more.' });
    }
    reply
      .type(result.attachment.mime)
      .header('content-length', String(result.bytes.byteLength))
      .header(
        'content-disposition',
        `inline; filename="${encodeURIComponent(result.attachment.name)}"`,
      );
    return result.bytes;
  });
}

function isTooLarge(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE'
  );
}

export const multipartLimits = { fileSize: MAX_FILE_BYTES, files: 1 };
