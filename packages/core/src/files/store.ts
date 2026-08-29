import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  INBOX_DIR,
  MAX_FILE_BYTES,
  RUNTIME_DIR,
  classifyFile,
  mimeFor,
  type Attachment,
} from '@openbot/shared';
import type { ProjectPaths } from '../storage/paths.js';

export interface SaveFileInput {
  name: string;
  bytes: Uint8Array;
  mime?: string;
}

/**
 * Files the person hands the team. They land in `inbox/` under the original
 * name, and stay there; a bot copies them into a working folder.
 */
export class FileStore {
  constructor(private readonly paths: ProjectPaths) {}

  static async open(paths: ProjectPaths): Promise<FileStore> {
    await fs.mkdir(paths.inboxDir, { recursive: true });
    return new FileStore(paths);
  }

  async save(input: SaveFileInput): Promise<Attachment> {
    if (input.bytes.byteLength > MAX_FILE_BYTES) {
      throw new FileTooLargeError();
    }
    const name = safeFileName(input.name);
    const ext = path.extname(name);
    const stem = path.basename(name, ext) || 'file';
    let stored = name;
    let n = 2;
    for (;;) {
      const rel = `${INBOX_DIR}/${stored}`;
      try {
        await fs.writeFile(this.#inside(rel), input.bytes, { flag: 'wx' });
        return this.#describe(rel, stored, input.bytes.byteLength, input.mime);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        stored = `${stem}-${n}${ext}`;
        n += 1;
      }
    }
  }

  /**
   * Metadata for a file already in the project. Returns null if it is missing
   * or outside the folder.
   */
  async inspect(rel: string): Promise<Attachment | null> {
    let abs: string;
    try {
      abs = this.#inside(rel);
    } catch {
      return null;
    }
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile()) return null;
      return this.#describe(toPosix(path.relative(this.paths.root, abs)), path.basename(abs), stat.size);
    } catch {
      return null;
    }
  }

  async read(rel: string): Promise<{ bytes: Buffer; attachment: Attachment } | null> {
    const attachment = await this.inspect(rel);
    if (!attachment) return null;
    const bytes = await fs.readFile(this.#inside(attachment.path));
    return { bytes, attachment };
  }

  /** Absolute path, or throw if the relative path escapes the project. */
  resolve(rel: string): string {
    return this.#inside(rel);
  }

  #describe(rel: string, name: string, size: number, mime?: string): Attachment {
    const kind = classifyFile({ name, mime });
    return {
      name,
      path: rel,
      mime: mime && mime !== 'application/octet-stream' ? mime : mimeFor(name, mime),
      size,
      kind: kind.id,
    };
  }

  #inside(rel: string): string {
    const trimmed = rel.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!trimmed || path.isAbsolute(trimmed)) {
      throw new Error('That file is not in the team folder.');
    }
    const normalised = path.posix.normalize(trimmed);
    if (normalised.startsWith('..') || path.posix.isAbsolute(normalised)) {
      throw new Error('That file is not in the team folder.');
    }
    const top = normalised.split('/')[0] ?? '';
    if (top === RUNTIME_DIR) {
      throw new Error('That file is not in the team folder.');
    }
    return this.paths.workspace(normalised);
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super('That file is too large.');
    this.name = 'FileTooLargeError';
  }
}

function safeFileName(raw: string): string {
  const base = path.basename(raw.replace(/\\/g, '/')).replace(/[^\w.\- ()[\]]+/g, '_');
  const trimmed = base.replace(/^\.+/g, '').trim();
  return (trimmed || 'file').slice(0, 120);
}

function toPosix(rel: string): string {
  return rel.split(path.sep).join('/');
}
