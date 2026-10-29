import { isCritical } from '../lighting/battery';
import { el, useTheme } from './theme';

/** The HUD's slots (spec 10): filled by specs 05 (prompt), 06 (battery), 12 (petals) and 14 (clock). */
export type HudSlot = 'prompt' | 'battery' | 'petals' | 'clock';

export interface Hud {
  /** Shows a slot's value; `undefined` hides it. Battery is 0..1, petals a count, the rest text. */
  set(slot: HudSlot, value: string | number | undefined): void;
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
  const petals = corner('hud-petals', { right: '16px', bottom: '16px' });
  const clock = corner('hud-clock', { right: '16px', top: '16px' });

  return {
    set(slot, value) {
      if (slot === 'prompt') {
        if (value === undefined) options.prompt.hide();
        else options.prompt.show(String(value));
        return;
      }
      const node = slot === 'battery' ? battery : slot === 'petals' ? petals : clock;
      node.style.display = value === undefined ? 'none' : 'block';
      if (value === undefined) return;
      if (slot === 'battery') {
        const level = Math.max(0, Math.min(1, Number(value)));
        fill.style.width = `${Math.round(level * 100)}%`;
        // Red once critical (spec 17).
        fill.style.background = isCritical(level) ? '#b03a2e' : '#d9b46c';
      }
      else if (slot === 'petals') node.textContent = `Petals: ${value}`;
      else node.textContent = String(value);
    },
  };
}
