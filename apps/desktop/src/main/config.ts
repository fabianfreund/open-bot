import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { RecentProject, RemoteConnection } from '../shared-ipc.js';

interface AppConfig {
  recentProjects: RecentProject[];
  remotes: RemoteConnection[];
  last?: { mode: 'host' | 'remote'; key: string };
}

const EMPTY: AppConfig = { recentProjects: [], remotes: [] };

/**
 * App-level preferences, kept in Electron's userData, deliberately separate
 * from project folders, which stay portable.
 */
export class ConfigStore {
  #cache: AppConfig = EMPTY;

  /** Resolved lazily: `app.setName()` has to run before this path is read. */
  get #file(): string {
    return path.join(app.getPath('userData'), 'openbot.json');
  }

  async load(): Promise<AppConfig> {
    try {
      this.#cache = {
        ...EMPTY,
        ...(JSON.parse(await fs.readFile(this.#file, 'utf8')) as AppConfig),
      };
    } catch {
      this.#cache = EMPTY;
    }
    return this.#cache;
  }

  get current(): AppConfig {
    return this.#cache;
  }

  async rememberProject(project: RecentProject): Promise<void> {
    const rest = this.#cache.recentProjects.filter((p) => p.root !== project.root);
    this.#cache.recentProjects = [project, ...rest].slice(0, 8);
    this.#cache.last = { mode: 'host', key: project.root };
    await this.#save();
  }

  async rememberRemote(remote: RemoteConnection): Promise<void> {
    const rest = this.#cache.remotes.filter((r) => r.url !== remote.url);
    this.#cache.remotes = [remote, ...rest].slice(0, 8);
    this.#cache.last = { mode: 'remote', key: remote.url };
    await this.#save();
  }

  async forgetLast(): Promise<void> {
    delete this.#cache.last;
    await this.#save();
  }

  async #save(): Promise<void> {
    await fs.mkdir(path.dirname(this.#file), { recursive: true });
    await fs.writeFile(this.#file, `${JSON.stringify(this.#cache, null, 2)}\n`, 'utf8');
  }
}
