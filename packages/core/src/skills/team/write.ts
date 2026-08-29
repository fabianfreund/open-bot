import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ToolField } from './parse.js';

export async function writeTeamTool(options: {
  toolsDir: string;
  id: string;
  title: string;
  description: string;
  instructions: string;
  fields?: ToolField[];
  script?: string;
}): Promise<string> {
  const dir = path.join(options.toolsDir, options.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'TOOL.md'), renderToolMarkdown(options), 'utf8');
  if (options.script !== undefined) {
    const scripts = path.join(dir, 'scripts');
    await fs.mkdir(scripts, { recursive: true });
    await fs.writeFile(path.join(scripts, 'run.js'), options.script, 'utf8');
  }
  return dir;
}

export function renderToolMarkdown(options: {
  id: string;
  title: string;
  description: string;
  instructions: string;
  fields?: ToolField[];
}): string {
  const lines = [
    '---',
    `name: ${options.id}`,
    `title: ${yamlScalar(options.title)}`,
    `description: ${yamlScalar(options.description)}`,
  ];
  if (options.fields && options.fields.length > 0) {
    lines.push('input:');
    for (const field of options.fields) {
      lines.push(`  ${field.name}: ${yamlScalar(field.description)}`);
    }
  }
  lines.push('---', '', options.instructions.trim(), '');
  return lines.join('\n');
}

function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9 _.,'-]*$/.test(value) && !value.includes(': ')) {
    return value;
  }
  return JSON.stringify(value);
}
