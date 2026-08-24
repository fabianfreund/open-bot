import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/**
 * Finds the Codex CLI.
 *
 * The SDK can find its own vendored binary, but only by resolving
 * `@openai/codex` relative to its own file. Once the SDK is bundled into the
 * Electron main process that anchor is gone and it fails with "Unable to
 * locate Codex CLI binaries". So OpenBot resolves the binary itself and hands
 * the SDK an explicit path.
 *
 * A GUI app on macOS does not inherit the shell's PATH either, so looking in
 * the usual install directories matters as much as asking PATH.
 */

let cached: string | null | undefined;

export async function locateCodex(explicit?: string): Promise<string | null> {
  if (explicit && (await isExecutable(explicit))) return explicit;
  if (cached !== undefined) return cached;
  cached = await search();
  return cached;
}

async function search(): Promise<string | null> {
  const fromEnv = process.env.OPENBOT_CODEX_PATH;
  if (fromEnv && (await isExecutable(fromEnv))) return fromEnv;

  const vendored = await vendoredBinary();
  if (vendored) return vendored;

  for (const dir of await candidateDirs()) {
    const candidate = path.join(dir, binaryName());
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

/**
 * The binary shipped inside `@openai/codex`. Works when OpenBot runs from
 * source; silently unavailable once bundled, which is the point of the rest.
 */
async function vendoredBinary(): Promise<string | null> {
  try {
    const require = createRequire(import.meta.url);
    const codexRoot = path.dirname(require.resolve('@openai/codex/package.json'));
    const bin = path.join(codexRoot, 'bin', 'codex.js');
    return (await isExecutable(bin)) ? bin : null;
  } catch {
    return null;
  }
}

async function candidateDirs(): Promise<string[]> {
  const home = os.homedir();
  const dirs = [
    ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.deno', 'bin'),
  ];

  // Node installed through nvm lives under a version folder, so glob it.
  const nvm = path.join(home, '.nvm', 'versions', 'node');
  try {
    for (const version of await fs.readdir(nvm)) {
      dirs.push(path.join(nvm, version, 'bin'));
    }
  } catch {
    // No nvm on this machine.
  }

  return [...new Set(dirs)];
}

function binaryName(): string {
  return process.platform === 'win32' ? 'codex.exe' : 'codex';
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return false;
    await fs.access(file, fs.constants?.X_OK ?? 1);
    return true;
  } catch {
    return false;
  }
}
