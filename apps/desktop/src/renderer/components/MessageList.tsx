import { useEffect, useRef } from 'react';
import type { AgentView, Card, Message } from '@openbot/shared';
import { CardList } from './cards/index.js';
import { Markdown } from './Markdown.js';
import { TraceList } from './TraceList.js';

interface Props {
  messages: Message[];
  agents: AgentView[];
  onAnswerCard(message: Message, card: Card, answer: string): void;
}

export function MessageList({ messages, agents, onAnswerCard }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, messages[messages.length - 1]?.body]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto flex max-w-[720px] flex-col gap-3">
        {messages.map((message, index) => (
          <Bubble
            key={message.id}
            message={message}
            agents={agents}
            showDay={showDay(messages, index)}
            onAnswerCard={onAnswerCard}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function Bubble({
  message,
  agents,
  showDay,
  onAnswerCard,
}: {
  message: Message;
  agents: AgentView[];
  showDay: boolean;
  onAnswerCard(message: Message, card: Card, answer: string): void;
}) {
  const mine = message.author.kind === 'user';
  const relayed = message.relayedFrom;
  const color =
    agents.find((a) => a.definition.id === message.author.id)?.definition.avatar.color ?? '#8a8a93';

  return (
    <>
      {showDay && (
        <div className="my-2 text-center text-[11px] text-[var(--color-muted)]">
          {dayLabel(message.createdAt)}
        </div>
      )}
      {relayed && (
        <div className="mt-1 text-right text-[11px] text-[var(--color-muted)]">
          Message from <span style={{ color }}>{relayed}</span>
        </div>
      )}
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] ${
            mine ? 'bg-[#2f6fd0] text-white' : 'bg-[var(--color-raised)]'
          }`}
        >
          {!mine && <TraceList parts={message.parts} />}
          {message.body ? (
            <Markdown text={message.body} />
          ) : (
            message.streaming && <Typing />
          )}
          <CardList
            cards={message.cards}
            onAnswer={(card, answer) => onAnswerCard(message, card, answer)}
          />
        </div>
      </div>
    </>
  );
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
