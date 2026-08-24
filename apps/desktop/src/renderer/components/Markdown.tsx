import { Fragment, useMemo } from 'react';

/**
 * Just enough markdown for chat: bullets, bold, inline code, paragraphs.
 * Keeps the bundle small and the output predictable, a chat window is not a
 * document renderer.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parse(text), [text]);
  return (
    <div className="space-y-2 leading-[1.55] whitespace-pre-wrap">
      {blocks.map((block, index) =>
        block.type === 'list' ? (
          <ul key={index} className="ml-4 list-disc space-y-1 marker:text-[var(--color-muted)]">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{inline(block.text)}</p>
        ),
      )}
    </div>
  );
}

type Block = { type: 'p'; text: string } | { type: 'list'; items: string[] };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list });
    list = [];
  };
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join('\n') });
    paragraph = [];
  };

  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1] ?? '');
    } else if (!line.trim()) {
      flushList();
      flushParagraph();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushList();
  flushParagraph();
  return blocks;
}

/** Handles `**bold**` and `` `code` ``. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={index} className="rounded bg-white/8 px-1 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
