import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { OpenBotRuntime, createProject } from '@openbot/core';
import { startServer, type ServerHandle } from '@openbot/server';
import type { Connection } from '../shared-ipc.js';

/**
 * The app can either *host* a project (running the server in this process) or
 * *connect* to one hosted elsewhere. The renderer never knows the difference:
 * both end up as a base URL plus a token.
 */
export class Host {
  #server?: ServerHandle;
  #runtime?: OpenBotRuntime;

  get connection(): Connection | null {
    if (!this.#server || !this.#runtime) return null;
    return {
      mode: 'host',
      baseUrl: this.#server.url,
      token: this.#runtime.token,
      projectName: this.#runtime.projectName,
      root: this.#runtime.projectRoot,
    };
  }

  /** The address a paired device should use, if the server is reachable. */
  async invite(tailnetAddress: string | undefined): Promise<{ url: string; token: string } | null> {
    if (!this.#server || !this.#runtime) return null;
    const port = new URL(this.#server.url).port;
    const url = tailnetAddress ? `http://${tailnetAddress}:${port}` : this.#server.url;
    return { url, token: this.#runtime.token };
  }

  /**
   * Creates a team in `root`, or opens the one already there. Picking a folder
   * that is already a team means "I want that team", not a mistake worth an
   * error, so this never dead-ends on a folder the person chose deliberately.
   */
  async create(root: string, name: string): Promise<Connection> {
    if (await holdsProject(root)) return this.open(root);
    await createProject({ root, name });
    return this.open(root, true);
  }

  async open(root: string, seed = false): Promise<Connection> {
    await this.stop();
    const runtime = await OpenBotRuntime.open({
      root: path.resolve(root),
      bridgePath: resolveBridgePath(),
    });
    // Bind wide so a tailnet peer can reach it; the token is the gate.
    this.#server = await startServer({ runtime, host: '0.0.0.0' });
    this.#runtime = runtime;
    // A new team gets a bot that introduces itself and hires the rest.
    if (seed) await runtime.ensureOnboarding();
    const connection = this.connection;
    if (!connection) throw new Error('Server failed to start');
    return connection;
  }

  async stop(): Promise<void> {
    await this.#server?.close();
    this.#server = undefined;
    this.#runtime = undefined;
  }
}

/**
 * Codex spawns the skill bridge as a separate Node process. In development it
 * lives in the workspace; in a packaged app it is unpacked next to the app.
 */
function resolveBridgePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'skills-mcp', 'index.js');
  }
  return path.resolve(app.getAppPath(), '../../packages/skills-mcp/dist/index.js');
}

/** True when the folder already contains an OpenBot manifest. */
async function holdsProject(root: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, 'openbot.json'));
    return true;
  } catch {
    return false;
  }
}
