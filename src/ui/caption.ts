import { el, useTheme } from './theme';

export interface Caption {
  /** Shows a line said out of sight (La Sombra), for a few seconds. */
  show(speaker: string, line: string, seconds?: number): void;
}

/** A line on screen for a few seconds. Defaults: La Sombra's caption (dark red, a third of the way up). */
export function createCaption(options: { id?: string; colour?: string; bottom?: string } = {}): Caption {
  useTheme();
  const box = el('div', 'caption');
  box.id = options.id ?? 'caption';
  Object.assign(box.style, {
    position: 'fixed',
    left: '50%',
    bottom: options.bottom ?? '32%',
    transform: 'translateX(-50%)',
    maxWidth: '70%',
    textAlign: 'center',
    fontStyle: 'italic',
    fontSize: '22px',
    color: options.colour ?? '#c8504a',
    textShadow: '0 0 6px #000, 0 0 12px #000',
    opacity: '0',
    transition: 'opacity 0.4s',
    pointerEvents: 'none',
  });
  document.body.appendChild(box);
  let hide: ReturnType<typeof setTimeout> | undefined;
  return {
    show(speaker, line, seconds = 4) {
      box.textContent = speaker ? `${speaker}: ${line}` : line;
      box.style.opacity = '1';
      if (hide) clearTimeout(hide);
      hide = setTimeout(() => (box.style.opacity = '0'), seconds * 1000);
    },
  };
}
