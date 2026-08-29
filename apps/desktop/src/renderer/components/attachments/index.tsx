import { useEffect, useState, type ReactNode } from 'react';
import { File, FileSpreadsheet, FileText, X } from 'lucide-react';
import type { Attachment } from '@openbot/shared';
import { hostPath, openTarget } from '../../open.js';
import { useStore } from '../../state/store.js';
import { useTargetMenu } from '../TargetMenu.js';
import { useFileUrl } from './url.js';

/**
 * How a kind looks in the chat. Add a preview here when a new kind should
 * look different from a named chip; unknown kinds already work.
 */
const PREVIEW: Record<string, (props: FileProps) => ReactNode> = {
  image: ImagePreview,
};

export function AttachmentList({
  files,
  mine,
}: {
  files: Attachment[];
  mine: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {files.map((file) => {
        const Preview = PREVIEW[file.kind] ?? FileChip;
        return <Preview key={file.path} file={file} mine={mine} />;
      })}
    </div>
  );
}

interface FileProps {
  file: Attachment;
  mine: boolean;
}

function ImagePreview({ file, mine }: FileProps) {
  const url = useFileUrl(file.path);
  const target = useHostFile(file.path);
  const { openMenu, menu } = useTargetMenu();
  if (!url) return <FileChip file={file} mine={mine} />;
  return (
    <>
      <button
        type="button"
        onClick={() => target && openTarget(target)}
        onContextMenu={(event) => target && openMenu(event, target)}
        className="block overflow-hidden rounded-lg"
      >
        <img src={url} alt={file.name} className="max-h-48 max-w-full object-contain" />
      </button>
      {menu}
    </>
  );
}

function FileChip({ file, mine }: FileProps) {
  const target = useHostFile(file.path);
  const { openMenu, menu } = useTargetMenu();
  const Icon = iconFor(file.kind);
  return (
    <>
      <button
        type="button"
        onClick={() => target && openTarget(target)}
        onContextMenu={(event) => target && openMenu(event, target)}
        className={`flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] ${
          mine
            ? 'bg-white/15 hover:bg-white/25'
            : 'bg-[var(--color-code)] hover:bg-[var(--color-hover)]'
        }`}
      >
        <Icon size={13} className="shrink-0 opacity-80" />
        <span className="truncate">{file.name}</span>
      </button>
      {menu}
    </>
  );
}

export function PendingList({
  files,
  onRemove,
}: {
  files: File[];
  onRemove(index: number): void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
      {files.map((file, index) => (
        <PendingChip key={`${file.name}-${index}`} file={file} onRemove={() => onRemove(index)} />
      ))}
    </div>
  );
}

function PendingChip({ file, onRemove }: { file: File; onRemove(): void }) {
  const image = file.type.startsWith('image/');
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!image) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file, image]);
  return (
    <span className="relative flex items-center gap-1.5 overflow-hidden rounded-lg bg-[var(--color-code)] pr-1">
      {url ? (
        <img src={url} alt="" className="size-9 object-cover" />
      ) : (
        <span className="flex items-center gap-1.5 py-1 pl-2 text-[12px]">
          <File size={13} className="opacity-70" />
          <span className="max-w-[140px] truncate">{file.name || 'file'}</span>
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="flex size-5 items-center justify-center rounded-full text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <X size={12} />
      </button>
    </span>
  );
}

function iconFor(kind: string) {
  if (kind === 'spreadsheet') return FileSpreadsheet;
  if (kind === 'pdf' || kind === 'document') return FileText;
  return File;
}

function useHostFile(rel: string): string | undefined {
  const root = useStore((s) => s.project?.root);
  return root ? hostPath(root, rel) : undefined;
}
