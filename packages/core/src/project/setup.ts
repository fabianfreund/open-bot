import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectPaths } from '../storage/paths.js';

const RESERVED = new Set(['.openbot', 'agents', 'memory', 'tools', 'inbox']);

export interface TeamSetup {
  goal?: string;
  handbook?: string;
  folders?: string[];
  files?: { path: string; content: string }[];
}

export interface TeamSetupResult {
  goal: string;
  handbook: boolean;
  folders: string[];
  files: string[];
}

/**
 * Writes the on-disk half of a team setup: handbook, folders, reference
 * files. The runtime still has to save the goal and rewrite briefs.
 */
export async function writeTeamSetup(
  paths: ProjectPaths,
  input: TeamSetup,
): Promise<Omit<TeamSetupResult, 'goal'>> {
  const folders: string[] = [];
  for (const raw of input.folders ?? []) {
    const rel = safeRel(raw);
    if (!rel || rel === 'main' || rel === 'inbox') continue;
    await fs.mkdir(paths.workspace(rel), { recursive: true });
    folders.push(rel);
  }

  const files: string[] = [];
  for (const file of input.files ?? []) {
    const rel = safeRel(file.path);
    if (!rel) continue;
    const abs = paths.workspace(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.content.trimEnd() + '\n', 'utf8');
    files.push(rel);
    const top = rel.split('/')[0];
    if (top && top !== 'main' && !RESERVED.has(top) && !folders.includes(top)) folders.push(top);
  }

  let handbook = false;
  if (input.handbook !== undefined) {
    await fs.mkdir(paths.memoryDir, { recursive: true });
    await fs.writeFile(paths.handbookFile, input.handbook.trimEnd() + '\n', 'utf8');
    handbook = true;
  }

  return { handbook, folders, files };
}

export async function readHandbook(paths: ProjectPaths): Promise<string> {
  try {
    return (await fs.readFile(paths.handbookFile, 'utf8')).trim();
  } catch {
    return '';
  }
}

/** Project-relative path that cannot escape the folder or land in runtime state. */
export function safeRel(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!trimmed || path.isAbsolute(trimmed)) return null;
  const rel = path.posix.normalize(trimmed);
  if (rel.startsWith('..') || path.posix.isAbsolute(rel)) return null;
  const top = rel.split('/')[0] ?? '';
  if (RESERVED.has(top) && rel !== 'memory/handbook.md') return null;
  return rel;
}
