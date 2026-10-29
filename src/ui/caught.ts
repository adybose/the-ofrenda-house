import { el, useTheme } from './theme';

/** The words of the possessed ending when La Sombra catches the player (spec 12). */
export const CAUGHT_LINE = 'You lost. You were possessed by the spirit of La Sombra.';

/** Spec 12's placeholder until spec 14's possessed ending: the world fades to black, then the line. */
export function showCaught(): void {
  useTheme();
  const veil = el('div', 'caught');
  veil.id = 'caught';
  Object.assign(veil.style, {
    position: 'fixed',
    inset: '0',
    background: '#000',
    opacity: '0',
    transition: 'opacity 2.5s ease-in',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '50',
  });
  const words = el('div', '', CAUGHT_LINE);
  Object.assign(words.style, { color: '#c8504a', fontSize: '30px', fontStyle: 'italic', opacity: '0', transition: 'opacity 1.5s 2.2s', textAlign: 'center', padding: '0 10%' });
  veil.appendChild(words);
  document.body.appendChild(veil);
  requestAnimationFrame(() => {
    veil.style.opacity = '1';
    words.style.opacity = '1';
  });
}
