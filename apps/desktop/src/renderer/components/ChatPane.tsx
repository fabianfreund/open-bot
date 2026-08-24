import { useStore } from '../state/store.js';
import { Avatar } from './Avatar.js';
import { Composer } from './Composer.js';
import { MessageList } from './MessageList.js';
import { StatusInfo } from './StatusInfo.js';
import { ThemeToggle } from './ThemeToggle.js';

const BUSY = new Set(['thinking', 'working']);

export function ChatPane() {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const messages = useStore((s) => s.messages);
  const sendMessage = useStore((s) => s.sendMessage);
  const stop = useStore((s) => s.stop);
  const answerCard = useStore((s) => s.answerCard);

  const agent = agents.find((a) => a.definition.id === activeAgentId);
  const busy = agent ? BUSY.has(agent.status) : false;
  // One chat, one bot. Older history can hold a colleague's answer that was
  // copied in here; it belongs to the bot that asked, not to this chat.
  const shown = agent
    ? messages.filter((m) => m.author.kind !== 'agent' || m.author.id === agent.definition.id)
    : messages;

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="drag flex h-14 items-center gap-2.5 border-b border-[var(--color-line)] px-6">
        {agent && (
          <>
            <Avatar agent={agent.definition} size={26} status={agent.status} />
            <span className="text-[13.5px] font-medium">{agent.definition.name}</span>
            {LABEL[agent.status] && (
              <span className="text-[12px] text-[var(--color-muted)]">
                {agent.statusDetail ?? LABEL[agent.status]}
              </span>
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
            placeholder={`Message ${agent.definition.name}`}
            busy={busy}
            onSend={(text) => void sendMessage(text)}
            onStop={() => void stop()}
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[var(--color-muted)]" />
      )}
    </section>
  );
}

/** Only what the bot is doing right now. Being idle or offline is not news. */
const LABEL: Record<string, string> = {
  thinking: 'thinking',
  working: 'working',
  'waiting-on-user': 'waiting on you',
  error: 'hit a problem',
};
