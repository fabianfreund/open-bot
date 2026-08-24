import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SERVER_PORT,
  PROJECT_FILE_VERSION,
  ProjectFileSchema,
  newId,
  type ProjectFile,
} from '@openbot/shared';
import { ProjectPaths } from '../storage/paths.js';
import { writeJson } from '../storage/json-file.js';

export interface CreateProjectOptions {
  /** Absolute path of the folder to create the project in. */
  root: string;
  name?: string;
  port?: number;
}

/**
 * Scaffolds a new project folder. Everything the team owns lives under `root`
 * so the whole thing can be moved, backed up, or version-controlled as one unit.
 */
export async function createProject(options: CreateProjectOptions): Promise<ProjectFile> {
  const paths = new ProjectPaths(path.resolve(options.root));
  const name = options.name?.trim() || path.basename(paths.root);

  await assertUsable(paths.root);
  for (const dir of [paths.root, paths.agentsDir, paths.memoryDir, paths.runtimeDir]) {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.mkdir(paths.workspace('main'), { recursive: true });

  const file = ProjectFileSchema.parse({
    version: PROJECT_FILE_VERSION,
    id: newId('prj'),
    name,
    createdAt: new Date().toISOString(),
    settings: { port: options.port ?? DEFAULT_SERVER_PORT, bindHost: '127.0.0.1' },
    agents: [],
    workspaces: ['main'],
  });

  await writeJson(paths.projectFile, file);
  await fs.writeFile(path.join(paths.memoryDir, 'README.md'), MEMORY_README, 'utf8');
  await fs.writeFile(path.join(paths.root, '.gitignore'), PROJECT_GITIGNORE, 'utf8');
  return file;
}

async function assertUsable(root: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  const meaningful = entries.filter((e) => e !== '.DS_Store');
  if (meaningful.includes('openbot.json')) {
    throw new Error('That folder already holds an OpenBot project.');
  }
  if (meaningful.length > 0) {
    throw new Error('Pick an empty folder for a new project.');
  }
}

const MEMORY_README = `# Memory

Shared notes. Any agent can read these; agents write here with the \`remember\` skill.
`;

const PROJECT_GITIGNORE = `.openbot/
.DS_Store
`;
