import type { AudioEngine } from '../audio/engine';
import { speakerFor } from '../audio/voice';
import type { CaseFile } from '../case/types';
import type { Seed } from '../core/rng';
import { SHADOW_VOICE, assignVoices, type VoiceSpec } from '../dialogue/voices';

/** 20 words: the length the spec times. */
const SAMPLE = 'Who walks in my house on the night of the dead? Closer, stranger, and tell me why you are here.';
const SHADOW_SAMPLE = 'You should not have come here, little thief. The house remembers every one of you.';

/**
 * `?debug=voices`: every spirit of the seed with its voice, a button to hear it, and how long the
 * first audio took, for the manual latency and listening checks (spec 09). Needs `npm run dev`.
 */
export function showVoicePanel(audio: AudioEngine, seed: Seed, caseFile: CaseFile): void {
  const speaker = speakerFor(audio);
  const voices = assignVoices(seed, caseFile.characters);
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
    <h2 style="margin:0 0 6px">Spirit voices</h2>
    <p id="vp-health" style="margin:0 0 6px;opacity:.8">Checking Piper…</p>
    <p style="margin:0 0 12px;opacity:.8">Each button speaks a 20-word line; the time is from the click to the first audio. Lines are cached on disk after the first time.</p>
    <label>Line <input id="vp-line" style="width:70%;font:inherit" value="${SAMPLE}"></label>
    <div id="vp-rows" style="margin-top:12px;display:grid;grid-template-columns:auto auto auto auto;gap:6px 14px;align-items:center"></div>`;
  document.body.appendChild(panel);
  void fetch('/api/health')
    .then((r) => r.json() as Promise<{ piper: boolean }>)
    .then((h) => (panel.querySelector('#vp-health')!.textContent = h.piper ? 'Piper is ready.' : 'Piper or its voices are missing: lines will show as text only.'))
    .catch(() => (panel.querySelector('#vp-health')!.textContent = 'The local server is not running (npm run dev).'));

  const rows = panel.querySelector('#vp-rows')!;
  const add = (name: string, voice: VoiceSpec, line: () => string) => {
    const label = document.createElement('span');
    label.textContent = name;
    const settings = document.createElement('span');
    settings.style.opacity = '0.7';
    settings.textContent = `${voice.voiceId}, pitch ${voice.pitch}, rate ${voice.rate}${voice.shadow ? ', whispered' : ''}`;
    const button = document.createElement('button');
    button.textContent = 'speak';
    Object.assign(button.style, { font: 'inherit', padding: '2px 10px', cursor: 'pointer' });
    const result = document.createElement('span');
    button.addEventListener('click', async () => {
      await audio.unlock();
      audio.setOutdoors(false);
      audio.setListener([0, 1.6, 0], [0, 0, -1]);
      const started = performance.now();
      const { spoken, durationMs } = await speaker.speak(line(), voice);
      const ms = Math.round(performance.now() - started);
      result.textContent = spoken ? `first audio in ${ms} ms, lasts ${((durationMs ?? 0) / 1000).toFixed(1)} s` : 'no speech: text only';
    });
    rows.append(label, settings, button, result);
  };
  const input = panel.querySelector<HTMLInputElement>('#vp-line')!;
  for (const character of caseFile.characters) {
    const voice = voices[character.id];
    if (voice) add(`${character.name} (${character.role})`, voice, () => input.value);
  }
  add('La Sombra', SHADOW_VOICE, () => (input.value === SAMPLE ? SHADOW_SAMPLE : input.value));
}
