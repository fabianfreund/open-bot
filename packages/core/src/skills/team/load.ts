import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { fail, ok, type Skill } from '../skill.js';
import { folderToId, parseToolMarkdown, type ToolField } from './parse.js';
import { findScript, runToolScript } from './script.js';

const TEAM_SOURCE = 'team';

export { TEAM_SOURCE };

/**
 * Every valid tool folder under `tools/` as a Skill. A folder without a
 * TOOL.md is ignored; a TOOL.md with a bad id is ignored. Builtin ids are
 * skipped later, when the registry loads these.
 */
export async function loadTeamTools(toolsDir: string): Promise<Skill[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(toolsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(toolsDir, entry.name);
    const markdown = await readToolMarkdown(dir);
    if (!markdown) continue;
    const parsed = parseToolMarkdown(markdown, folderToId(entry.name));
    if (!parsed) continue;
    skills.push(asSkill(parsed, dir));
  }
  return skills;
}

async function readToolMarkdown(dir: string): Promise<string | undefined> {
  for (const name of ['TOOL.md', 'tool.md']) {
    try {
      return await fs.readFile(path.join(dir, name), 'utf8');
    } catch {
      // try the next name
    }
  }
  return undefined;
}

function asSkill(
  tool: {
    id: string;
    title: string;
    description: string;
    timeoutMs: number;
    fields: ToolField[];
    body: string;
  },
  dir: string,
): Skill {
  return {
    id: tool.id,
    title: tool.title,
    description: tool.description,
    input: inputSchema(tool.fields),
    async run(raw, ctx) {
      const script = await findScript(dir);
      if (!script) {
        return ok(tool.body || `${tool.title} has no playbook yet.`);
      }
      const result = await runToolScript({
        script,
        cwd: dir,
        stdin: JSON.stringify(raw ?? {}),
        timeoutMs: tool.timeoutMs,
        env: {
          OPENBOT_PROJECT: ctx.host.projectRoot,
          OPENBOT_AGENT_ID: ctx.agent.id,
          OPENBOT_AGENT_NAME: ctx.agent.name,
          OPENBOT_TOOL: tool.id,
        },
      });
      if (result.code !== 0) {
        const detail =
          result.stderr.trim() || result.stdout.trim() || `The script exited ${result.code}.`;
        return fail(detail);
      }
      return ok(result.stdout.trim() || 'Done.');
    },
  };
}

function inputSchema(fields: ToolField[]): z.ZodType<Record<string, unknown>> {
  if (fields.length === 0) {
    return z.object({
      input: z
        .string()
        .optional()
        .describe('Anything the tool needs. A script reads this JSON on stdin.'),
    });
  }
  const shape: Record<string, z.ZodType<string>> = {};
  for (const field of fields) {
    shape[field.name] = z.string().min(1).describe(field.description);
  }
  return z.object(shape);
}
