import { useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { activity, busy as isBusy } from '../status-labels.js';
import { Avatar } from './Avatar.js';
import { Composer, isFileDrag, takeDroppedFiles, type ComposerHandle } from './Composer.js';
import { MessageList } from './MessageList.js';
import { StatusInfo } from './StatusInfo.js';
import { ThemeToggle } from './ThemeToggle.js';

export function ChatPane() {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const messages = useStore((s) => s.messages);
  const sendMessage = useStore((s) => s.sendMessage);
  const stop = useStore((s) => s.stop);
  const answerCard = useStore((s) => s.answerCard);

  const [over, setOver] = useState(false);
  const dragDepth = useRef(0);
  const composer = useRef<ComposerHandle>(null);

  const agent = agents.find((a) => a.definition.id === activeAgentId);
  const busy = agent ? isBusy(agent.status) : false;
  // One chat, one bot. Older history can hold a colleague's answer that was
  // copied in here; it belongs to the bot that asked, not to this chat.
  const shown = agent
    ? messages.filter((m) => m.author.kind !== 'agent' || m.author.id === agent.definition.id)
    : messages;

  return (
    <section
      className="rise-in relative flex min-w-0 flex-1 flex-col"
      onDragEnter={(event) => {
        if (!agent || !isFileDrag(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => {
        if (!agent || !isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!isFileDrag(event)) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setOver(false);
        }
      }}
      onDrop={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setOver(false);
        if (!agent) return;
        const files = takeDroppedFiles(event);
        if (files.length) composer.current?.addFiles(files);
      }}
    >
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/5" />
      )}
      <header className="drag flex h-14 items-center gap-2.5 border-b border-[var(--color-line)] px-6">
        {agent && (
          <>
            <Avatar agent={agent.definition} size={26} status={agent.status} />
            <span className="text-[13.5px] font-medium">{agent.definition.name}</span>
            {activity(agent) && (
              <span className="text-[12px] text-[var(--color-muted)]">{activity(agent)}</span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <StatusInfo />
          <ThemeToggle />
        </div>
      </header>

      {agent ? (
        <>
          <MessageList
            messages={shown}
            onAnswerCard={(message, card, answer) => void answerCard(message, card, answer)}
          />

          <Composer
            ref={composer}
            placeholder={`Message ${agent.definition.name}`}
            busy={busy}
            onSend={(text, files) => sendMessage(text, files)}
            onStop={() => void stop()}
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[var(--color-muted)]" />
      )}
    </section>
  );
}
