#!/usr/bin/env node
import path from 'node:path';
import { OpenBotRuntime, createLogger } from '@openbot/core';
import { startServer } from './app.js';

/**
 * Headless entrypoint:
 *
 *   openbot-server /path/to/project [--host 0.0.0.0] [--port 7788]
 *
 * Useful for running a team on a machine with no display, reached from the
 * desktop app over Tailscale.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) ?? process.cwd();
  const host = readFlag(args, '--host');
  const portRaw = readFlag(args, '--port');
  const log = createLogger('openbot');

  const runtime = await OpenBotRuntime.open({ root: path.resolve(root), logger: log });
  await runtime.ensureOnboarding();
  const server = await startServer({
    runtime,
    ...(host ? { host } : {}),
    ...(portRaw ? { port: Number(portRaw) } : {}),
  });

  log.info(`"${runtime.projectName}" is running at ${server.url}`);
  log.info(`Pairing token: ${runtime.token}`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0));
    });
  }
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
