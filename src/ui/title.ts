import { el, useTheme } from './theme';

/**
 * The title screen (spec 14): the game's name and "Click to enter". The click (or a key) unlocks the
 * audio and starts the prologue. It also says whether the local model and voices were found.
 */
export function showTitle(onEnter: () => void): void {
  useTheme();
  const screen = el('div', 'title');
  screen.id = 'title';
  Object.assign(screen.style, {
    position: 'fixed',
    inset: '0',
    background: 'radial-gradient(ellipse at center, rgba(20,14,10,0.85), #000 75%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    zIndex: '60',
    cursor: 'pointer',
    textAlign: 'center',
  });
  const name = el('h1', '', 'The Ofrenda House');
  Object.assign(name.style, { color: '#d9b46c', fontSize: '56px', fontWeight: 'normal', letterSpacing: '0.08em', margin: '0' });
  const enter = el('div', '', 'Click to enter');
  Object.assign(enter.style, { color: '#efe4c8', fontSize: '22px', fontStyle: 'italic' });
  const status = el('div', 'title-status', 'Listening for the dead…');
  Object.assign(status.style, { color: '#8a7f6a', fontSize: '15px', marginTop: '24px' });
  screen.append(name, enter, status);
  document.body.appendChild(screen);

  void fetch('/api/health', { signal: AbortSignal.timeout(2500) })
    .then((r) => (r.ok ? (r.json() as Promise<{ ollama?: boolean; piper?: boolean }>) : undefined))
    .catch(() => undefined)
    .then((health) => {
      const found = (yes: boolean | undefined, what: string, without: string) => (yes ? `${what} found` : `${what} not found: ${without}`);
      status.textContent = [found(health?.ollama, 'Ollama', 'the spirits use their written lines'), found(health?.piper, 'Piper', 'the spirits speak in text')].join(' · ');
    });

  const go = () => {
    window.removeEventListener('keydown', go);
    screen.remove();
    onEnter();
  };
  screen.addEventListener('click', go);
  window.addEventListener('keydown', go);
}
