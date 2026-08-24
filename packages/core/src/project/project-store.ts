import { promises as fs } from 'node:fs';
import {
  PROJECT_FILE_VERSION,
  ProjectFileSchema,
  newId,
  type ProjectFile,
  type ProjectInfo,
} from '@openbot/shared';
import { ProjectPaths } from '../storage/paths.js';
import { readJson, writeJson } from '../storage/json-file.js';

/** Loads and persists `openbot.json`. The manifest is the source of truth. */
export class ProjectStore {
  #file: ProjectFile;

  private constructor(
    public readonly paths: ProjectPaths,
    file: ProjectFile,
  ) {
    this.#file = file;
  }

  static async load(root: string): Promise<ProjectStore> {
    const paths = new ProjectPaths(root);
    const raw = await readJson<unknown>(paths.projectFile, null);
    if (raw === null) throw new Error(`No ${paths.projectFile}. Not an OpenBot project`);
    const parsed = ProjectFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`openbot.json is invalid: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }
    if (parsed.data.version > PROJECT_FILE_VERSION) {
      throw new Error(
        `Project was created by a newer OpenBot (v${parsed.data.version}). Update the app.`,
      );
    }
    return new ProjectStore(paths, parsed.data);
  }

  get file(): ProjectFile {
    return this.#file;
  }

  get info(): ProjectInfo {
    return { file: this.#file, root: this.paths.root };
  }

  async update(mutate: (file: ProjectFile) => void): Promise<ProjectFile> {
    const next = structuredClone(this.#file);
    mutate(next);
    this.#file = ProjectFileSchema.parse(next);
    await writeJson(this.paths.projectFile, this.#file);
    return this.#file;
  }

  /**
   * Shared secret a remote client must present. Generated on first run and
   * stored outside the manifest so the manifest stays safe to share.
   */
  async token(): Promise<string> {
    try {
      const existing = (await fs.readFile(this.paths.tokenFile, 'utf8')).trim();
      if (existing) return existing;
    } catch {
      // fall through and mint one
    }
    const token = newId('tok', 32);
    await fs.mkdir(this.paths.runtimeDir, { recursive: true });
    await fs.writeFile(this.paths.tokenFile, `${token}\n`, { mode: 0o600 });
    return token;
  }
}
