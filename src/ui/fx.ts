import { ui } from './store.svelte';

export function haptic(p: number | number[]) {
  if (!ui.s.settings.haptics) return;
  try {
    navigator.vibrate?.(p);
  } catch {}
}

let ctx: AudioContext | undefined;
export function sound(kind: 'roll' | 'good' | 'bad' | 'tap') {
  if (!ui.s.settings.sound) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    if (kind === 'roll') {
      for (let i = 0; i < 6; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = 180 + Math.random() * 220;
        g.gain.setValueAtTime(0.0001, t + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.08 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.06);
        o.connect(g).connect(ctx.destination);
        o.start(t + i * 0.08);
        o.stop(t + i * 0.08 + 0.07);
      }
      return;
    }
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = kind === 'bad' ? 'sawtooth' : 'sine';
    const f = kind === 'good' ? [523, 784] : kind === 'bad' ? [220, 147] : [660, 660];
    o.frequency.setValueAtTime(f[0], t);
    o.frequency.exponentialRampToValueAtTime(f[1], t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(kind === 'bad' ? 0.06 : 0.1, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.32);
  } catch {}
}
