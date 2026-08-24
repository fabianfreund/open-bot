import { ExternalLink } from 'lucide-react';
import type { LinkCardProps } from '@openbot/shared';
import { openTarget } from '../../open.js';
import { useTargetMenu } from '../TargetMenu.js';
import type { CardProps } from './types.js';

/**
 * Buttons that open what a bot made: a file, a folder, or a page. The bot
 * names the thing, the person taps it, nobody copies a path.
 */
export function LinkCard({ card }: CardProps) {
  const props = card.props as unknown as LinkCardProps;
  const { openMenu, menu } = useTargetMenu();
  if (!props.items?.length) return null;

  return (
    <div className="mt-2.5 space-y-1.5">
      {props.items.map((item) => (
        <button
          key={item.target + item.label}
          onClick={() => openTarget(item.target)}
          onContextMenu={(event) => openMenu(event, item.target)}
          title={item.target}
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] px-3 py-2 text-left hover:border-[var(--color-accent)] hover:bg-[var(--color-hover)]"
        >
          <ExternalLink size={14} className="shrink-0 text-[var(--color-muted)]" />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px]">{item.label}</span>
            {item.note && (
              <span className="block truncate text-[11.5px] text-[var(--color-muted)]">
                {item.note}
              </span>
            )}
          </span>
        </button>
      ))}
      {menu}
    </div>
  );
}
