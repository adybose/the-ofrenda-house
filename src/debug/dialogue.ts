import type { CaseFile, CharacterId } from '../case/types';
import { STREAMS, createRng } from '../core/rng';
import { draw } from '../dialogue/replies';
import { applyReply, initialTrust, trustBucket } from '../dialogue/trust';
import { assignVoices } from '../dialogue/voices';
import { clueCardFrom } from '../ui/clue-card';
import type { Dialogue } from '../ui/dialogue-box';
import type { Journal } from '../ui/journal';

/** Test handle on window.__dialogue, installed by `?debug=dialogue`. */
export interface DialogueDebug {
  /** Shows a line (not awaited); `spoken` asks the first spirit's voice to speak it. */
  say(speaker: string, line: string, spoken?: boolean): void;
  /** Shows a question with numbered options; `picked()` gives the chosen index once there is one. */
  ask(line: string, options: string[]): void;
  picked(): string | undefined;
  close(): void;
  /** Hands over one clue of each kind (or just `count`) and the first spirit's key. */
  giveClues(count?: number): void;
  paused(): boolean;
}

declare global {
  interface Window {
    __dialogue?: DialogueDebug;
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `?debug=dialogue`: the dialogue box and journal with mock lines. By default a demo conversation
 * plays with each spirit in turn (greeting, who-are-you, a clue and a key); `&demo=0` leaves it to the
 * test handle.
 */
export function installDialogueDebug(options: { dialogue: Dialogue; journal: Journal; caseFile: CaseFile; seed: number; demo: boolean }): void {
  const { dialogue, journal, caseFile, seed } = options;
  const spirits = caseFile.characters.filter((c) => c.role !== 'patriarch');
  const voices = assignVoices(seed, caseFile.characters);
  const first = spirits[0]!;
  let picked: string | undefined;

  window.__dialogue = {
    say(speaker, line, spoken) {
      void dialogue.say({ speaker, line, voice: spoken ? voices[first.id] : undefined });
    },
    ask(line, choices) {
      picked = undefined;
      void dialogue.say({ speaker: first.name, line });
      void dialogue.choose(choices.map((text, i) => ({ id: String(i), text }))).then((id) => (picked = id));
    },
    picked: () => picked,
    close: () => dialogue.close(),
    giveClues(count = 4) {
      const kinds = ['motive', 'means', 'opportunity', 'alibi'] as const;
      for (const kind of kinds.slice(0, count)) {
        const fact = caseFile.facts.find((f) => f.kind === kind);
        if (fact) journal.addClue(clueCardFrom(fact));
      }
      journal.addKey(`key:${first.id}`);
    },
    paused: () => journal.isOpen(),
  };

  if (!options.demo) return;
  void (async () => {
    let trust = initialTrust();
    const rng = createRng(seed).fork(STREAMS.dialogue);
    for (let i = 0; ; i = (i + 1) % spirits.length) {
      const spirit = spirits[i]!;
      const voice = voices[spirit.id as CharacterId];
      journal.meet(spirit.id);
      await dialogue.say({ speaker: spirit.name, line: 'Who walks in my house on the night of the dead? Closer, stranger, and tell me why you are here.', voice });
      void dialogue.say({ speaker: spirit.name, line: 'Tell me who you are.', voice });
      const replies = draw(rng, spirit.id);
      const id = await dialogue.choose(replies.map((r) => ({ id: r.id, text: r.text })));
      const reply = replies.find((r) => r.id === id);
      if (reply) trust = applyReply(trust, spirit.id, reply);
      const level = trust.trust[spirit.id] ?? 50;
      await dialogue.say({ speaker: '(debug)', line: `${reply?.category ?? 'no'} reply. Trust ${level} (${trustBucket(level)}); told the truth so far: ${trust.toldTheTruth ? 'yes' : 'no'}.` });
      const fact = caseFile.facts.find((f) => f.holderId === spirit.id);
      if (fact) {
        await dialogue.say({ speaker: spirit.name, line: fact.text, voice });
        journal.addClue(clueCardFrom(fact));
      }
      journal.addKey(`key:${spirit.id}`);
      dialogue.close();
      await pause(2500);
    }
  })();
}
