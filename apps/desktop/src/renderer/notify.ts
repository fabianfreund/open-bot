import type { Message } from '@openbot/shared';

const heard: string[] = [];
let ctx: AudioContext | undefined;

/** Unlock audio after a click so the next bot message can actually ping. */
export function armNotify(): void {
  const arm = () => {
    ctx ??= new AudioContext();
    void ctx.resume();
    window.removeEventListener('pointerdown', arm);
  };
  window.addEventListener('pointerdown', arm);
}

/**
 * A short ping when a bot has said something. Deduped per message so a
 * streamed reply dings once, when it lands, not on every flush.
 */
export function notifyIfNewMessage(message: Message): void {
  if (message.author.kind !== 'agent') return;
  if (message.streaming) return;
  if (!message.body.trim() && message.cards.length === 0) return;
  if (heard.includes(message.id)) return;
  heard.push(message.id);
  if (heard.length > 40) heard.shift();
  void ping();
}

async function ping(): Promise<void> {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const t = ctx.currentTime;
    tone(ctx, 784, t, 0.09);
    tone(ctx, 1175, t + 0.07, 0.11);
  } catch {
    // Autoplay can block until they click once. The next message will try again.
  }
}

function tone(audio: AudioContext, hz: number, when: number, duration: number): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(hz, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.08, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}
