import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { AgentView } from '@openbot/shared';
import { useStore } from '../../state/store.js';
import { Avatar } from '../Avatar.js';
import { GHOST, ICON_BUTTON } from '../controls.js';
import { NewBotDialog } from '../NewBotDialog.js';
import { Chip } from './Chip.js';
import { Field, TextField } from './Field.js';

export function BotsSection() {
  const agents = useStore((s) => s.agents);
  const hireBot = useStore((s) => s.hireBot);
  const setView = useStore((s) => s.setView);
  const [openId, setOpenId] = useState<string>();
  const [hiring, setHiring] = useState(false);

  return (
    <div className="max-w-[640px]">
      <div className="mb-2 flex justify-end">
        <button onClick={() => setHiring(true)} className={ICON_BUTTON} title="Hire">
          <Plus size={16} />
        </button>
      </div>

      {agents.map((agent) => (
        <BotCard
          key={agent.definition.id}
          agent={agent}
          open={openId === agent.definition.id}
          onToggle={() =>
            setOpenId((id) => (id === agent.definition.id ? undefined : agent.definition.id))
          }
        />
      ))}

      {hiring && (
        <NewBotDialog
          onClose={() => setHiring(false)}
          onCreate={async (input) => {
            // Hiring opens the new bot's chat, which is right from the sidebar
            // and wrong from here: you are still setting the team up.
            await hireBot(input);
            setView('settings');
            setHiring(false);
          }}
        />
      )}
    </div>
  );
}

function BotCard({ agent, open, onToggle }: { agent: AgentView; open: boolean; onToggle(): void }) {
  const skills = useStore((s) => s.skills);
  const changeBot = useStore((s) => s.changeBot);
  const retireBot = useStore((s) => s.retireBot);
  const [confirming, setConfirming] = useState(false);
  const bot = agent.definition;
  const everything = bot.skills.includes('*');

  /** Turning one tool off spells the rest out, so nothing is lost silently. */
  const toggleSkill = (id: string) => {
    const current = everything ? skills.map((s) => s.id) : bot.skills;
    const next = current.includes(id)
      ? current.filter((s) => s !== id)
      : [...current, id].sort((a, b) => a.localeCompare(b));
    void changeBot(bot.id, { skills: next });
  };

  return (
    <div className="mb-1.5 rounded-xl border border-[var(--color-line)]">
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <Avatar agent={bot} size={30} status={agent.status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{bot.name}</span>
          <span className="block truncate text-[12px] text-[var(--color-muted)]">{bot.role}</span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-[var(--color-muted)] ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--color-line)] p-3">
          <TextField
            label="Name"
            value={bot.name}
            required
            onSave={(name) => void changeBot(bot.id, { name })}
          />
          <TextField
            label="What they own"
            value={bot.role}
            onSave={(role) => void changeBot(bot.id, { role })}
          />
          <TextField
            label="Brief"
            value={bot.instructions}
            rows={6}
            onSave={(instructions) => void changeBot(bot.id, { instructions })}
          />

          <Field label="Tools">
            <div className="flex flex-wrap gap-1.5">
              <Chip
                label="All tools"
                on={everything}
                onClick={() =>
                  void changeBot(bot.id, { skills: everything ? skills.map((s) => s.id) : ['*'] })
                }
              />
              {!everything &&
                skills.map((skill) => (
                  <Chip
                    key={skill.id}
                    label={skill.title}
                    on={bot.skills.includes(skill.id)}
                    onClick={() => toggleSkill(skill.id)}
                  />
                ))}
            </div>
          </Field>

          <div className="flex justify-end">
            <button
              onClick={() => (confirming ? void retireBot(bot.id) : setConfirming(true))}
              onBlur={() => setConfirming(false)}
              className={GHOST}
            >
              {confirming ? 'Retire, sure?' : 'Retire'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
