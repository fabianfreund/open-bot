/**
 * TOOL.md is markdown with a small YAML front matter. The parser is the
 * format: name, title, description, optional timeout (seconds), optional
 * input fields. Anything fancier belongs in the body or a script.
 */

export interface ToolField {
  name: string;
  description: string;
}

export interface ParsedTool {
  id: string;
  title: string;
  description: string;
  /** How long a script may run. */
  timeoutMs: number;
  fields: ToolField[];
  body: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const ID = /^[a-z][a-z0-9_]*$/;

export function folderToId(folder: string): string {
  return folder.trim().toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function toolIdFromName(name: string): string | null {
  const id = folderToId(name);
  return ID.test(id) ? id : null;
}

export function parseToolMarkdown(text: string, fallbackId: string): ParsedTool | null {
  const { data, body } = splitFrontmatter(text);
  const rawName = stringValue(data.name) ?? fallbackId;
  const id = toolIdFromName(rawName);
  if (!id) return null;

  const title = stringValue(data.title)?.trim() || titleFromId(id);
  const description = stringValue(data.description)?.trim() || title;
  const timeoutMs = timeoutFrom(data.timeout);
  const fields = fieldsFrom(data.input);

  return { id, title, description, timeoutMs, fields, body: body.trim() };
}

export function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const src = text.replace(/^\uFEFF/, '');
  if (!src.startsWith('---')) return { data: {}, body: src };
  const afterOpen = src.slice(3).match(/^\r?\n/);
  if (!afterOpen) return { data: {}, body: src };
  const rest = src.slice(3 + afterOpen[0].length);
  const close = rest.match(/\r?\n---(?:\r?\n|$)/);
  if (!close || close.index === undefined) return { data: {}, body: src };
  return {
    data: parseSimpleYaml(rest.slice(0, close.index)),
    body: rest.slice(close.index + close[0].length),
  };
}

function parseSimpleYaml(raw: string): Record<string, unknown> {
  const lines = raw.split(/\r?\n/);
  const out: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    i += 1;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1]!;
    const rest = match[2]!;
    if (rest === '|' || rest === '>') {
      const collected: string[] = [];
      while (i < lines.length && (lines[i] === '' || /^\s+/.test(lines[i]!))) {
        collected.push(lines[i]!.replace(/^\s{2}/, ''));
        i += 1;
      }
      out[key] = collected.join('\n').trim();
    } else if (rest === '') {
      const nested: Record<string, string> = {};
      while (i < lines.length && /^\s+\S/.test(lines[i]!)) {
        const nestedLine = lines[i]!;
        i += 1;
        const nestedMatch = nestedLine.match(/^\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/);
        if (nestedMatch) nested[nestedMatch[1]!] = unquote(nestedMatch[2]!);
      }
      out[key] = nested;
    } else {
      out[key] = unquote(rest);
    }
  }
  return out;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function timeoutFrom(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(stringValue(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.round(n * 1000), MAX_TIMEOUT_MS);
}

function fieldsFrom(value: unknown): ToolField[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([name, description]) => ({
      name,
      description: stringValue(description)?.trim() || name,
    }))
    .filter((field) => ID.test(field.name));
}

function titleFromId(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
