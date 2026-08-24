import { useEffect, useRef } from 'react';
import type { Card, Message, TracePart } from '@openbot/shared';
import { CardList } from './cards/index.js';
import { Markdown } from './Markdown.js';
import { TraceList } from './TraceList.js';

interface Props {
  messages: Message[];
  onAnswerCard(message: Message, card: Card, answer: string): void;
}

export function MessageList({ messages, onAnswerCard }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, messages[messages.length - 1]?.body]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto flex max-w-[720px] flex-col gap-3">
        {messages.map((message, index) => (
          <MessageBlocks
            key={message.id}
            message={message}
            showDay={showDay(messages, index)}
            onAnswerCard={onAnswerCard}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function MessageBlocks({
  message,
  showDay,
  onAnswerCard,
}: {
  message: Message;
  showDay: boolean;
  onAnswerCard(message: Message, card: Card, answer: string): void;
}) {
  const mine = message.author.kind === 'user';
  const blocks = mine ? [{ kind: 'text' as const, text: message.body }] : split(message);
  const last = blocks.filter((b) => b.kind === 'text').at(-1);
  const empty = blocks.every((b) => b.kind !== 'text');

  return (
    <>
      {showDay && (
        <div className="my-2 text-center text-[11px] text-[var(--color-muted)]">
          {dayLabel(message.createdAt)}
        </div>
      )}
      {blocks.map((block, index) =>
        block.kind === 'steps' ? (
          <TraceList key={index} parts={block.parts} />
        ) : (
          <Bubble key={index} mine={mine}>
            <Markdown text={block.text} />
            {block === last && (
              <CardList
                cards={message.cards}
                onAnswer={(card, answer) => onAnswerCard(message, card, answer)}
              />
            )}
          </Bubble>
        ),
      )}
      {empty && (message.cards.length > 0 || message.streaming) && (
        <Bubble mine={mine}>
          {message.streaming && message.cards.length === 0 && <Typing />}
          <CardList
            cards={message.cards}
            onAnswer={(card, answer) => onAnswerCard(message, card, answer)}
          />
        </Bubble>
      )}
    </>
  );
}

function Bubble({ mine, children }: { mine: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] ${
          mine ? 'bg-[#2f6fd0] text-white' : 'bg-[var(--color-raised)]'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

type Block = { kind: 'text'; text: string } | { kind: 'steps'; parts: TracePart[] };

/**
 * What the bot is thinking is a step like any other, but only while it is
 * still going. Once it has answered, the answer is the point.
 */
function steps(message: Message): TracePart[] {
  const done = message.parts.filter((p) => p.kind !== 'reasoning');
  if (!message.streaming) return done;
  const thinking = message.parts.filter((p) => p.kind === 'reasoning').at(-1);
  return thinking ? [...done, { ...thinking, status: 'in-progress' as const }] : done;
}

/**
 * Puts what the bot did back where it happened: the text it had said by then,
 * then the steps, then the rest. Steps sit outside the bubbles. Messages from
 * before steps were placed have no position, so they all land at the top.
 */
function split(message: Message): Block[] {
  const parts = steps(message);
  const place = (part: TracePart) => Math.min(part.at ?? 0, message.body.length);
  const blocks: Block[] = [];
  const points = [...new Set(parts.map(place))].sort((a, b) => a - b);

  let cursor = 0;
  for (const point of points) {
    const text = message.body.slice(cursor, point).trim();
    if (text) blocks.push({ kind: 'text', text });
    cursor = Math.max(cursor, point);
    blocks.push({ kind: 'steps', parts: parts.filter((p) => place(p) === point) });
  }
  const rest = message.body.slice(cursor).trim();
  if (rest) blocks.push({ kind: 'text', text: rest });
  return blocks;
}

function Typing() {
  return (
    <span className="flex gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-[var(--color-muted)]"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

function showDay(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const previous = messages[index - 1]?.createdAt ?? '';
  return previous.slice(0, 10) !== (messages[index]?.createdAt ?? '').slice(0, 10);
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `Today ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
