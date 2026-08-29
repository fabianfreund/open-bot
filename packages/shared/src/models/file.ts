import { z } from 'zod';

/** Project-relative folder where dropped files land. Always mounted for every bot. */
export const INBOX_DIR = 'inbox';

/** One file in a chat message. The bytes live on disk at `path`. */
export const AttachmentSchema = z.object({
  /** Original filename, for display. */
  name: z.string(),
  /** Project-relative path, e.g. `inbox/logo.png`. */
  path: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  /** Selects a preview. Unknown values render as a generic file. */
  kind: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * How a dropped file is treated. Add a row to support a new type; unknown
 * files fall through to `file`. The app may add a preview for a kind; without
 * one it still works, as a named chip.
 */
export interface FileKind {
  id: string;
  /** One word, used when telling a bot what it was handed. */
  label: string;
  extensions: string[];
  /** Match `mime === prefix` or `mime.startsWith(prefix)`. */
  mimePrefixes: string[];
  /** Hand to the provider as a local image, besides the file on disk. */
  vision: boolean;
}

export const FILE_KINDS: FileKind[] = [
  {
    id: 'image',
    label: 'image',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg'],
    mimePrefixes: ['image/'],
    vision: true,
  },
  {
    id: 'pdf',
    label: 'pdf',
    extensions: ['pdf'],
    mimePrefixes: ['application/pdf'],
    vision: false,
  },
  {
    id: 'spreadsheet',
    label: 'spreadsheet',
    extensions: ['xlsx', 'xls', 'csv', 'tsv', 'ods', 'xlsm'],
    mimePrefixes: [
      'text/csv',
      'text/tab-separated-values',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml',
    ],
    vision: false,
  },
  {
    id: 'document',
    label: 'document',
    extensions: ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'markdown', 'pages', 'html', 'htm'],
    mimePrefixes: [
      'text/plain',
      'text/markdown',
      'text/html',
      'application/msword',
      'application/rtf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml',
    ],
    vision: false,
  },
  {
    id: 'file',
    label: 'file',
    extensions: [],
    mimePrefixes: [],
    vision: false,
  },
];

const GENERIC = FILE_KINDS[FILE_KINDS.length - 1]!;

/** Raster formats Codex will take as `local_image`. SVG is XML; send the path. */
const NOT_VISION = new Set(['svg']);

export function extensionOf(name: string): string {
  const base = name.replace(/^.*[/\\]/, '');
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function kindById(id: string): FileKind {
  return FILE_KINDS.find((kind) => kind.id === id) ?? GENERIC;
}

export function classifyFile(input: { name: string; mime?: string }): FileKind {
  const ext = extensionOf(input.name);
  const mime = (input.mime ?? '').toLowerCase();
  for (const kind of FILE_KINDS) {
    if (kind.id === GENERIC.id) continue;
    if (ext && kind.extensions.includes(ext)) return kind;
    if (mime && kind.mimePrefixes.some((prefix) => mime === prefix || mime.startsWith(prefix))) {
      return kind;
    }
  }
  return GENERIC;
}

export function sendsAsImage(attachment: Attachment): boolean {
  if (!kindById(attachment.kind).vision) return false;
  return !NOT_VISION.has(extensionOf(attachment.name));
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
  zip: 'application/zip',
};

export function mimeFor(name: string, fallback = 'application/octet-stream'): string {
  return EXT_MIME[extensionOf(name)] ?? fallback;
}

export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_ATTACHMENTS = 8;
