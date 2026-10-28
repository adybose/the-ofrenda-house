/** The small "E" hint at the bottom of the screen when something can be used. */
export function createPrompt(): { show(text: string): void; hide(): void; text(): string } {
  const box = document.createElement('div');
  box.id = 'interact-prompt';
  Object.assign(box.style, {
    position: 'fixed',
    left: '50%',
    bottom: '14%',
    transform: 'translateX(-50%)',
    padding: '4px 12px',
    font: '18px Georgia, "Times New Roman", serif',
    color: '#e8dcc0',
    background: 'rgba(0, 0, 0, 0.55)',
    border: '1px solid rgba(232, 220, 192, 0.35)',
    letterSpacing: '0.04em',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '5',
  });
  document.body.appendChild(box);
  return {
    show(text) {
      if (box.textContent !== text) box.textContent = text;
      box.style.display = 'block';
    },
    hide() {
      box.style.display = 'none';
    },
    text: () => (box.style.display === 'none' ? '' : (box.textContent ?? '')),
  };
}
