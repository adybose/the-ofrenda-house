import { el, useTheme } from './theme';

export type EndingKind = 'true' | 'escape';

/** The story's words for each ending reached through the garden door (spec 21). */
const ENDINGS: Record<EndingKind, { title: string; text: string }> = {
  true: {
    title: 'The true ending',
    text: "The spirits turn on the Shadow, and it burns away. The painter unveils a last painting: a baby, Elena. You know that face. It is your grandmother's. The patriarch lets you go. Dawn breaks on 2 November.",
  },
  escape: {
    title: 'The escape ending',
    text: 'The Shadow is bound, and you walk out into the night. Behind you the spirits stay, and the house waits for the next trespasser.',
  },
};

/** A placeholder ending screen until spec 14's: a fade to black, the ending's title and its words. */
export function showEnding(kind: EndingKind): void {
  useTheme();
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
  Object.assign(title.style, { color: '#d9b46c', fontSize: '40px', fontWeight: 'normal', margin: '0' });
  const words = el('p', '', ENDINGS[kind].text);
  Object.assign(words.style, { color: '#efe4c8', fontSize: '22px', lineHeight: '1.5', fontStyle: 'italic', margin: '0' });
  veil.append(title, words);
  document.body.appendChild(veil);
  requestAnimationFrame(() => (veil.style.opacity = '1'));
}
