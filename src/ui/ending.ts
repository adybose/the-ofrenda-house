import { ENDINGS, type EndingKind } from '../story/flow';
import { el, useTheme } from './theme';

export type { EndingKind } from '../story/flow';

/** An ending (spec 14): a fade to black, its title and the story's words, and a way to play again. */
export function showEnding(kind: EndingKind): void {
  useTheme();
  document.getElementById('ending')?.remove();
  const veil = el('div', 'ending');
  veil.id = 'ending';
  veil.dataset.kind = kind;
  Object.assign(veil.style, {
    position: 'fixed',
    inset: '0',
    background: '#000',
    opacity: '0',
    transition: 'opacity 2s ease-in',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '24px',
    zIndex: '50',
    padding: '0 15%',
    textAlign: 'center',
  });
  const title = el('h1', '', ENDINGS[kind].title);
  Object.assign(title.style, { color: kind === 'possessed' || kind === 'trapped' ? '#c8504a' : '#d9b46c', fontSize: '40px', fontWeight: 'normal', margin: '0' });
  const words = el('p', '', ENDINGS[kind].text);
  Object.assign(words.style, { color: '#efe4c8', fontSize: '22px', lineHeight: '1.5', fontStyle: 'italic', margin: '0' });
  const buttons = el('div', '');
  Object.assign(buttons.style, { display: 'flex', gap: '20px', marginTop: '12px' });
  const button = (text: string, keepSeed: boolean) => {
    const b = el('button', 'ending-choice', text);
    Object.assign(b.style, { font: 'inherit', fontSize: '18px', color: '#efe4c8', background: '#1a1410', border: '1px solid #d9b46c', padding: '10px 18px', cursor: 'pointer' });
    b.addEventListener('click', () => {
      const url = new URL(window.location.href);
      // A new household, or this one again; either way, from the start.
      if (!keepSeed) url.searchParams.delete('seed');
      for (const flag of ['ending', 'skip', 'clock']) url.searchParams.delete(flag);
      window.location.href = url.toString();
    });
    return b;
  };
  buttons.append(button('Play again (new household)', false), button('Replay this seed', true));
  veil.append(title, words, buttons);
  document.body.appendChild(veil);
  requestAnimationFrame(() => (veil.style.opacity = '1'));
}
