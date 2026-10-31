import { isCritical } from '../lighting/battery';
import { el, useTheme } from './theme';

/** The HUD's slots (spec 10): filled by specs 05 (prompt), 06 (battery), 18 (matches, candles, keys) and 14 (clock). */
export type HudSlot = 'prompt' | 'battery' | 'matches' | 'candles' | 'keys' | 'clock';

export interface Hud {
  /** Shows a slot's value; `undefined` hides it. Battery is 0..1, matches a count, the rest text. */
  set(slot: HudSlot, value: string | number | undefined): void;
  /** Spec 14's candle clock: the time, and a candle burning down with the night left (0..1). */
  clock(text: string, left: number): void;
  /** Spec 24: the heart, pulsing at this many beats a minute. */
  heart(bpm: number): void;
}

export function createHud(options: { prompt: { show(text: string): void; hide(): void } }): Hud {
  useTheme();
  const corner = (id: string, place: Partial<CSSStyleDeclaration>) => {
    const slot = el('div', 'hud-slot');
    slot.id = id;
    Object.assign(slot.style, place, { display: 'none' });
    document.body.appendChild(slot);
    return slot;
  };
  const battery = corner('hud-battery', { left: '16px', bottom: '16px' });
  const bar = el('span');
  Object.assign(bar.style, { display: 'inline-block', width: '60px', height: '8px', marginLeft: '8px', border: '1px solid #efe4c8', verticalAlign: 'middle' });
  const fill = el('span');
  Object.assign(fill.style, { display: 'block', height: '100%', background: '#d9b46c' });
  bar.appendChild(fill);
  battery.append('Torch', bar);
  // What the player carries, stacked bottom right (spec 18).
  const matches = corner('hud-matches', { right: '16px', bottom: '64px' });
  const candles = corner('hud-candles', { right: '16px', bottom: '40px' });
  const keys = corner('hud-keys', { right: '16px', bottom: '16px' });
  const clock = corner('hud-clock', { right: '16px', top: '16px' });
  // The heart beside the torch (spec 24): a red heart pulsing at the heart rate, and the rate.
  if (!document.getElementById('hud-heart-beat')) {
    const style = document.createElement('style');
    style.id = 'hud-heart-beat';
    style.textContent = '@keyframes ofr-beat { 0% { transform: scale(1); } 12% { transform: scale(1.35); } 24% { transform: scale(1); } 36% { transform: scale(1.18); } 50%, 100% { transform: scale(1); } }';
    document.head.appendChild(style);
  }
  const heart = corner('hud-heart', { left: '160px', bottom: '16px' });
  const symbol = el('span', '', '♥');
  Object.assign(symbol.style, { display: 'inline-block', color: '#c8302a', fontSize: '18px', marginRight: '6px', animation: 'ofr-beat 0.88s infinite', textShadow: '0 0 6px #7a0f0a' });
  const rate = el('span', '', '68 bpm');
  heart.append(symbol, rate);
  const candle = el('span');
  Object.assign(candle.style, { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '30px', width: '10px', marginRight: '8px', verticalAlign: 'middle' });
  const flame = el('span');
  Object.assign(flame.style, { width: '6px', height: '9px', borderRadius: '50% 50% 45% 45%', background: '#ffc46b', boxShadow: '0 0 6px #ffa64a' });
  const wax = el('span');
  Object.assign(wax.style, { width: '8px', height: '20px', background: '#d9ceb0' });
  candle.append(flame, wax);
  const time = el('span');

  return {
    heart(bpm) {
      heart.style.display = 'block';
      symbol.style.animationDuration = `${(60 / bpm).toFixed(3)}s`;
      rate.textContent = `${bpm} bpm`;
    },
    clock(text, left) {
      if (!clock.contains(candle)) clock.replaceChildren(candle, time);
      clock.style.display = 'block';
      wax.style.height = `${Math.round(2 + 18 * Math.max(0, Math.min(1, left)))}px`;
      time.textContent = text;
    },
    set(slot, value) {
      if (slot === 'prompt') {
        if (value === undefined) options.prompt.hide();
        else options.prompt.show(String(value));
        return;
      }
      const node = { battery, matches, candles, keys, clock }[slot];
      node.style.display = value === undefined ? 'none' : 'block';
      if (value === undefined) return;
      if (slot === 'battery') {
        const level = Math.max(0, Math.min(1, Number(value)));
        fill.style.width = `${Math.round(level * 100)}%`;
        // Red once critical (spec 17).
        fill.style.background = isCritical(level) ? '#b03a2e' : '#d9b46c';
      }
      else if (slot === 'matches') node.textContent = `Matches: ${value}`;
      else node.textContent = String(value);
    },
  };
}
