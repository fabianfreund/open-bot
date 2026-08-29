import path from 'node:path';
import { sendsAsImage, type Attachment } from '@openbot/shared';

/**
 * What the model is told about files on this turn. Images also go as
 * `local_image`; everything is a real file they can open, copy, or move.
 */
export function turnText(text: string, attachments: Attachment[]): string {
  const note = describeAttachments(attachments);
  const body = text.trim();
  if (body && note) return `${body}\n\n${note}`;
  return body || note;
}

export function visionPaths(root: string, attachments: Attachment[]): string[] {
  return attachments.filter(sendsAsImage).map((file) => path.resolve(root, file.path));
}

function describeAttachments(attachments: Attachment[]): string {
  if (attachments.length === 0) return '';
  const lines = attachments.map((file) => `- \`${file.path}\` (${file.kind}, ${file.name})`);
  return [
    'The person handed you these files. They live in the team folder. Copy them where the work should live and leave the originals in inbox/.',
    ...lines,
  ].join('\n');
}
