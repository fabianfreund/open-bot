import { useStore } from '../state/store.js';
import { Avatar } from './Avatar.js';
import { Composer } from './Composer.js';
import { MessageList } from './MessageList.js';

const BUSY = new Set(['thinking', 'working']);

export function ChatPane() {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const messages = useStore((s) => s.messages);
  const sendMessage = useStore((s) => s.sendMessage);
  const stop = useStore((s) => s.stop);
  const answerCard = useStore((s) => s.answerCard);

  const agent = agents.find((a) => a.definition.id === activeAgentId);
  if (!agent) {
    return <section className="flex flex-1 items-center justify-center text-[var(--color-muted)]" />;
  }

  const busy = BUSY.has(agent.status);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="drag flex h-14 items-center gap-2.5 border-b border-[var(--color-line)] px-6">
        <Avatar agent={agent.definition} size={24} />
        <span className="text-[13.5px] font-medium">{agent.definition.name}</span>
        {agent.status !== 'idle' && (
          <span className="text-[12px] text-[var(--color-muted)]">
            {agent.statusDetail ?? LABEL[agent.status]}
          </span>
        )}
      </header>

      <MessageList
        messages={messages}
        agents={agents}
        onAnswerCard={(message, card, answer) => void answerCard(message, card, answer)}
      />

      <Composer
        placeholder={`Message ${agent.definition.name}`}
        busy={busy}
        onSend={(text) => void sendMessage(text)}
        onStop={() => void stop()}
      />
    </section>
  );
}

const LABEL: Record<string, string> = {
  thinking: 'thinking',
  working: 'working',
  'waiting-on-user': 'waiting on you',
  error: 'hit a problem',
};
