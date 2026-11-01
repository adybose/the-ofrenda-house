import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { VOICES } from '../src/dialogue/voices';
import { buildServer } from './index';
import { configFromEnv } from './llm/ollama';

const port = Number(process.env.PORT ?? 8787);
const server = buildServer();

await server.listen({ host: '127.0.0.1', port });
console.log(`Ofrenda House server listening on http://127.0.0.1:${port}`);

// `npm start` (spec 15): what was found on this Mac, how to fix what wasn't, and where to play.
if (process.argv.includes('--status')) {
  const { host } = configFromEnv();
  const ollamaUp = await fetch(`${host}/api/version`, { signal: AbortSignal.timeout(1500) }).then(
    (r) => r.ok,
    () => false,
  );
  const model = ollamaUp && (await server.llm.available());
  const voices = VOICES.every((v) => existsSync(join('voices', `${v.id}.onnx`)) && existsSync(join('voices', `${v.id}.onnx.json`)));
  const speech = await server.tts.available();
  const line = (ok: boolean, what: string, fix: string) => console.log(`  ${ok ? 'found  ' : 'missing'}  ${what}${ok ? '' : `\n           ${fix}`}`);
  console.log('\nThe Ofrenda House');
  line(ollamaUp, 'Ollama', 'Spirits will use their written lines. To have them improvise: brew install ollama && ollama serve');
  if (ollamaUp) line(model, 'Gemma 3 4B (gemma3:4b)', 'Spirits will use their written lines. Run: ollama pull gemma3:4b');
  line(voices, 'Piper voice models (voices/)', 'Spirits will speak in captions only. Run: npm run setup:voices');
  if (voices) line(speech, 'Piper', 'Spirits will speak in captions only. Run: python3 -m pip install --user piper-tts (or set PIPER_BIN)');
  console.log('\n  The game plays fully without any of these.');
  console.log('  Open http://localhost:4173 in Chrome, with headphones. Ctrl+C to stop.\n');
}
