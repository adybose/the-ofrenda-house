// Fetches the Piper voice models into voices/ once, at setup (spec 09). The game never downloads at
// runtime; without these files the server reports piper: false and spirits speak as text only.
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VOICES } from '../src/dialogue/voices';

const BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const DIR = 'voices';

await mkdir(DIR, { recursive: true });
for (const voice of VOICES) {
  for (const file of [`${voice.id}.onnx`, `${voice.id}.onnx.json`]) {
    const target = join(DIR, file);
    if (existsSync(target)) {
      console.log(`have ${file}`);
      continue;
    }
    const response = await fetch(`${BASE}/${voice.path}/${file}`);
    if (!response.ok) throw new Error(`could not fetch ${file}: HTTP ${response.status}`);
    // Download to a temporary name, so an interrupted run never leaves a half file that looks done.
    await writeFile(`${target}.part`, Buffer.from(await response.arrayBuffer()));
    await rename(`${target}.part`, target);
    console.log(`fetched ${file}`);
  }
}
console.log(`Voices ready in ${DIR}/. Piper itself: python3 -m pip install --user piper-tts`);
