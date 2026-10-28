import type { AudioEngine } from '../audio/engine';
import { SOUND_NAMES, type SoundName } from '../audio/synths';

const CHECKLIST = ['rain', 'wind', 'thunder', 'creak', 'slam', 'lock', 'footsteps', 'heartbeat', 'stingers', 'whispers', 'bat', 'rat', 'cat', 'clock'];

/** `?debug=soundboard`: a button for every sound, plus tension and room size, for the listening check. */
export function showSoundboard(audio: AudioEngine): void {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed',
    inset: '16px',
    overflow: 'auto',
    padding: '16px',
    background: 'rgba(10, 8, 6, 0.92)',
    color: '#e8dcc0',
    font: '14px Georgia, serif',
    zIndex: '20',
  });
  panel.innerHTML = `
    <h2 style="margin:0 0 6px">Soundboard</h2>
    <p style="margin:0 0 12px;opacity:.8">Click anywhere first to start audio (rain and wind start then). Headphones recommended. Listening checklist: ${CHECKLIST.join(', ')}.</p>
    <div id="sb-buttons" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px"></div>
    <label>Tension (heartbeat) <input id="sb-tension" type="range" min="0" max="1" step="0.05" value="0"></label>
    <label style="margin-left:16px">Room <select id="sb-room"><option>small</option><option selected>medium</option><option>large</option></select></label>
    <label style="margin-left:16px">Distance from window (m) <input id="sb-window" type="range" min="0" max="30" step="1" value="2"></label>
    <label style="margin-left:16px">Play 3 m to the <select id="sb-side"><option value="">centre</option><option value="left">left</option><option value="right">right</option></select></label>`;
  document.body.appendChild(panel);

  const params: Partial<Record<SoundName, { param: number; label: string }[]>> = {
    thunder: [
      { param: 1, label: 'thunder (overhead)' },
      { param: 0.3, label: 'thunder (far)' },
    ],
    clock: [
      { param: 1, label: 'clock (1)' },
      { param: 6, label: 'clock (6, dawn)' },
    ],
  };
  const side = panel.querySelector<HTMLSelectElement>('#sb-side')!;
  const buttons = panel.querySelector('#sb-buttons')!;
  for (const name of SOUND_NAMES.filter((n) => n !== 'rain' && n !== 'wind')) {
    for (const { param, label } of params[name] ?? [{ param: 0, label: name }]) {
      const button = document.createElement('button');
      button.textContent = label;
      Object.assign(button.style, { font: 'inherit', padding: '4px 10px', cursor: 'pointer' });
      button.addEventListener('click', async () => {
        await audio.unlock();
        const position = side.value === 'left' ? ([-3, 1.6, 0] as const) : side.value === 'right' ? ([3, 1.6, 0] as const) : undefined;
        audio.setListener([0, 1.6, 0], [0, 0, -1]);
        audio.play(name, { param, position });
      });
      buttons.appendChild(button);
    }
  }
  panel.querySelector<HTMLInputElement>('#sb-tension')!.addEventListener('input', (e) => audio.setTension(Number((e.target as HTMLInputElement).value)));
  panel.querySelector<HTMLSelectElement>('#sb-room')!.addEventListener('change', (e) => audio.setRoomSize((e.target as HTMLSelectElement).value as 'small' | 'medium' | 'large'));
  panel.querySelector<HTMLInputElement>('#sb-window')!.addEventListener('input', (e) => audio.setWindowDistance(Number((e.target as HTMLInputElement).value)));
  window.addEventListener('pointerdown', () => void audio.unlock(), { once: true });
}
