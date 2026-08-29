import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ScriptSpec {
  command: string;
  args: string[];
}

/**
 * The entry a team tool actually runs. `scripts/run` if it exists, otherwise
 * `run.js` / `run.mjs` / `run.sh` / `run.py` in that folder.
 */
export async function findScript(toolDir: string): Promise<ScriptSpec | undefined> {
  const dir = path.join(toolDir, 'scripts');
  const direct = path.join(dir, 'run');
  if (await isFile(direct)) return { command: direct, args: [] };
  const js = path.join(dir, 'run.js');
  if (await isFile(js)) return { command: process.execPath, args: [js] };
  const mjs = path.join(dir, 'run.mjs');
  if (await isFile(mjs)) return { command: process.execPath, args: [mjs] };
  const sh = path.join(dir, 'run.sh');
  if (await isFile(sh)) return { command: 'bash', args: [sh] };
  const py = path.join(dir, 'run.py');
  if (await isFile(py)) return { command: 'python3', args: [py] };
  return undefined;
}

export async function runToolScript(options: {
  script: ScriptSpec;
  cwd: string;
  stdin: string;
  timeoutMs: number;
  env: Record<string, string>;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(options.script.command, options.script.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });

    child.stdin?.write(options.stdin);
    child.stdin?.end();
  });
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}
