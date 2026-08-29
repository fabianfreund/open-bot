import { useEffect, useState } from 'react';
import NiceAvatar, { genConfig } from 'react-nice-avatar';
import { STATUS_INFO, STATUS_OK, STATUS_WARN } from '../../status-colors.js';

/** Short, ordinary jobs. Nothing here is real; it is the feel of a team at work. */
const WORK = [
  'Writing it up',
  'Looking into it',
  'Drafting a reply',
  'Checking the numbers',
  'Reading the notes',
  'Booking it in',
  'On it',
];

const MAX_FACES = 8;
const SIZE = [40, 58];
const LIFE_MS = [12_000, 19_000];
const SPAWN_MS = [900, 2200];

type Doing = 'idle' | 'thinking' | 'working';

/** A bot settles down to work, finishes, and is free again. */
const NEXT: Record<Doing, Doing> = { thinking: 'working', working: 'idle', idle: 'idle' };

const DOT: Record<Doing, string> = {
  idle: STATUS_OK,
  thinking: STATUS_INFO,
  working: STATUS_WARN,
};

interface Face {
  id: number;
  x: number;
  y: number;
  size: number;
  life: number;
  doing: Doing;
  text: string;
  config: ReturnType<typeof genConfig>;
}

/**
 * The team behind the card: faces come online, get on with something, and go
 * again. Decoration only, so it never takes a click and it stays out of the
 * way of the window controls and the card.
 */
export function TeamBackdrop() {
  const [faces, setFaces] = useState<Face[]>([]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let id = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setFaces((current) =>
        current.length >= MAX_FACES ? current : [...current, make(id++, current)],
      );
      timer = setTimeout(tick, between(SPAWN_MS[0]!, SPAWN_MS[1]!));
    };
    timer = setTimeout(tick, 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {faces.map((face) => (
        <FaceView
          key={face.id}
          face={face}
          onDone={() => setFaces((current) => current.filter((f) => f.id !== face.id))}
        />
      ))}
    </div>
  );
}

function FaceView({ face, onDone }: { face: Face; onDone(): void }) {
  const [doing, setDoing] = useState(face.doing);

  // Nobody works the whole time they are here. Moving on partway through is
  // what makes the wall read as people rather than a pattern.
  useEffect(() => {
    const first = setTimeout(() => setDoing(NEXT[face.doing]), face.life * 0.4);
    const second = setTimeout(() => setDoing(NEXT[NEXT[face.doing]]), face.life * 0.72);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [face.doing, face.life]);

  return (
    <div
      style={{ left: `${face.x}%`, top: `${face.y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2"
    >
      <div
        className="face"
        style={{ animationDuration: `${face.life}ms` }}
        // The bubble and the dots animate too, and their end events travel up
        // through here. Only the face's own life ends the face.
        onAnimationEnd={(event) => {
          if (event.animationName === 'face-life') onDone();
        }}
      >
        <div className="relative">
          <NiceAvatar
            style={{ width: face.size, height: face.size }}
            shape="circle"
            {...face.config}
          />
          <span
            className="absolute right-0 bottom-0 size-[30%] rounded-full ring-2 ring-[var(--color-surface)] transition-colors duration-500"
            style={{ background: DOT[doing] }}
          />
          {doing !== 'idle' && (
            <Bubble
              key={doing}
              text={doing === 'working' ? face.text : undefined}
              side={face.x > 50 ? 'left' : 'right'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Bubble({ text, side }: { text?: string; side: 'left' | 'right' }) {
  const right = side === 'right';
  return (
    <div className={`bubble absolute bottom-[72%] ${right ? 'left-[72%]' : 'right-[72%]'}`}>
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-sidebar)] px-2.5 py-1.5 text-[11px] whitespace-nowrap text-[var(--color-muted)] shadow-sm">
        {text ?? <Dots />}
      </div>
      <span
        className={`absolute -bottom-[5px] ${right ? 'left-2.5' : 'right-2.5'} size-[7px] rounded-full border border-[var(--color-line)] bg-[var(--color-sidebar)]`}
      />
      <span
        className={`absolute -bottom-3 ${right ? 'left-1' : 'right-1'} size-[5px] rounded-full border border-[var(--color-line)] bg-[var(--color-sidebar)]`}
      />
    </div>
  );
}

function Dots() {
  return (
    <span className="flex items-center gap-[3px] py-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="dot size-[3px] rounded-full bg-current"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

function make(id: number, current: Face[]): Face {
  const { x, y } = spot(current);
  const roll = Math.random();
  return {
    id,
    x,
    y,
    size: between(SIZE[0]!, SIZE[1]!),
    life: between(LIFE_MS[0]!, LIFE_MS[1]!),
    doing: roll < 0.45 ? 'thinking' : roll < 0.85 ? 'working' : 'idle',
    text: WORK[Math.floor(Math.random() * WORK.length)]!,
    config: genConfig(),
  };
}

/** Anywhere but under the card, the window controls, or another face. */
function spot(current: Face[]): { x: number; y: number } {
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = 7 + Math.random() * 86;
    const y = 9 + Math.random() * 82;
    // The card, with room for a bubble around it.
    if (x > 28 && x < 72 && y > 20 && y < 80) continue;
    // The window controls, top left.
    if (x < 16 && y < 14) continue;
    if (current.some((f) => Math.abs(f.x - x) < 12 && Math.abs(f.y - y) < 15)) continue;
    return { x, y };
  }
  return { x: 12, y: 84 };
}

function between(low: number, high: number): number {
  return Math.round(low + Math.random() * (high - low));
}
