import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { MAX_ATTACHMENTS } from '@openbot/shared';
import { PendingList } from './attachments/index.js';

interface Props {
  placeholder: string;
  busy: boolean;
  onSend(text: string, files: File[]): Promise<void> | void;
  onStop(): void;
}

export interface ComposerHandle {
  addFiles(files: File[]): void;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { placeholder, busy, onSend, onStop },
  handle,
) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const addFiles = (next: File[]) => {
    setFiles((current) => {
      const room = MAX_ATTACHMENTS - current.length;
      if (room <= 0) return current;
      return [...current, ...next.filter((file) => file.size > 0).slice(0, room)];
    });
  };

  useImperativeHandle(handle, () => ({ addFiles }), []);

  const submit = async () => {
    const value = text.trim();
    if ((!value && files.length === 0) || sending) return;
    setSending(true);
    try {
      await onSend(value, files);
      setText('');
      setFiles([]);
      if (ref.current) ref.current.style.height = 'auto';
    } finally {
      setSending(false);
    }
  };

  const canSend = (text.trim().length > 0 || files.length > 0) && !sending;

  return (
    <div className="px-6 pt-1 pb-5">
      <div className="mx-auto flex max-w-[720px] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-3 py-2">
        <PendingList files={files} onRemove={(index) => setFiles((c) => c.filter((_, i) => i !== index))} />
        <div className="flex items-end gap-2">
          <input
            ref={picker}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => picker.current?.click()}
            disabled={files.length >= MAX_ATTACHMENTS}
            className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-30"
            title="Add a file"
          >
            <Paperclip size={15} />
          </button>
          <textarea
            ref={ref}
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(event) => {
              setText(event.target.value);
              const el = event.target;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
            }}
            onPaste={(event) => {
              const pasted = [...event.clipboardData.files];
              if (pasted.length === 0) return;
              event.preventDefault();
              addFiles(pasted);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            className="max-h-[180px] flex-1 resize-none bg-transparent py-1 text-[13.5px] outline-none placeholder:text-[var(--color-muted)]"
          />
          {busy ? (
            <button
              onClick={onStop}
              className="mb-0.5 flex size-7 items-center justify-center rounded-full bg-[var(--color-code)] text-[var(--color-ink)] hover:opacity-80"
              title="Stop"
            >
              <span className="size-2.5 rounded-[2px] bg-current" />
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={!canSend}
              className="mb-0.5 flex size-7 items-center justify-center rounded-full bg-[var(--color-accent)] text-white disabled:opacity-30"
              title="Send"
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export function takeDroppedFiles(event: React.DragEvent): File[] {
  return [...event.dataTransfer.files].filter((file) => file.size > 0);
}

export function isFileDrag(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}
