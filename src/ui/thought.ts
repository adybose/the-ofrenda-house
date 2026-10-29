import { el, useTheme } from './theme';

/** Characters a second: a thought types out quickly. */
const TYPE_RATE = 60;
const HOLD_SECONDS = 4;

export interface Thoughts {
  show(id: string, text: string): void;
  /** Clears it at once (an encounter or the journal takes the screen). */
  hide(): void;
}

/** The stranger's thoughts (spec 20): italic, low and centred, typed out, then faded. */
export function createThoughts(): Thoughts {
  useTheme();
  const box = el('div', 'thought');
  box.id = 'thought';
  Object.assign(box.style, {
    position: 'fixed',
    left: '50%',
    bottom: '24%',
    transform: 'translateX(-50%)',
    maxWidth: '70%',
    textAlign: 'center',
    fontStyle: 'italic',
    fontSize: '22px',
    color: '#efe4c8',
    textShadow: '0 0 6px #000, 0 0 12px #000',
    opacity: '0',
    transition: 'opacity 0.6s',
    pointerEvents: 'none',
  });
  document.body.appendChild(box);
  let typing: ReturnType<typeof setInterval> | undefined;
  let hide: ReturnType<typeof setTimeout> | undefined;
  return {
    show(id, text) {
      if (typing) clearInterval(typing);
      if (hide) clearTimeout(hide);
      box.dataset.id = id;
      box.textContent = '';
      box.style.opacity = '1';
      let shown = 0;
      typing = setInterval(() => {
        shown = Math.min(text.length, shown + 2);
        box.textContent = text.slice(0, shown);
        if (shown >= text.length) clearInterval(typing);
      }, 2000 / TYPE_RATE);
      hide = setTimeout(() => (box.style.opacity = '0'), (text.length / TYPE_RATE + HOLD_SECONDS) * 1000);
    },
    hide() {
      if (typing) clearInterval(typing);
      if (hide) clearTimeout(hide);
      box.style.transition = 'none';
      box.style.opacity = '0';
      requestAnimationFrame(() => (box.style.transition = 'opacity 0.6s'));
    },
  };
}
