import type { Speaker } from '../audio/voice';
import type { VoiceSpec } from '../dialogue/voices';
import { el, useTheme } from './theme';
import { shownChars } from './typewriter';

export interface DialogueOption {
  id: string;
  text: string;
}

export interface Dialogue {
  /**
   * Shows a line, typed out (over its speech when the voice can speak it). Resolves when the player
   * moves on with a click or Space, or when a choice under it is made.
   */
  say(options: { speaker: string; line: string; voice?: VoiceSpec }): Promise<void>;
  /**
   * Offers 3 or 4 numbered options under the current line, once it has finished typing; resolves with
   * the chosen id. To ask a question, call `say` without awaiting it, then `choose`.
   */
  choose(options: readonly DialogueOption[]): Promise<string>;
  /** Hides the box; a pending line resolves, and a pending choice resolves with ''. */
  close(): void;
  isOpen(): boolean;
  /** What is on screen, for tests. */
  state(): { open: boolean; speaker: string; text: string; full: boolean; options: string[] };
}

/** How long to wait for speech before typing at the plain rate instead. */
const SPEECH_WAIT_MS = 1500;

/**
 * The dialogue box (spec 10): the speaker's name, typewriter text, and numbered choices taken by
 * click or the keys 1 to 4. While it is open, movement is off (`onOpenChange`) and the pointer is
 * released so options can be clicked.
 */
export function createDialogue(options: { speaker?: Speaker; onOpenChange?: (open: boolean) => void; inputBlocked?: () => boolean }): Dialogue {
  useTheme();
  const box = el('div', 'ofr-panel');
  box.id = 'dialogue';
  const name = el('div', 'ofr-name');
  name.id = 'dialogue-speaker';
  const text = el('div');
  text.id = 'dialogue-text';
  const more = el('span', '', '▸');
  more.id = 'dialogue-more';
  const list = el('ol');
  list.id = 'dialogue-options';
  box.append(name, more, text, list);
  box.style.display = 'none';
  document.body.appendChild(box);

  let open = false;
  /** The line on screen. `started` is undefined while waiting to hear whether it will be spoken. */
  let line: { text: string; started?: number; durationMs?: number; full: boolean; done: () => void } | undefined;
  let choice: { options: readonly DialogueOption[]; shown: boolean; resolve: (id: string) => void } | undefined;
  let frame = 0;

  const setOpen = (value: boolean) => {
    if (open === value) return;
    open = value;
    box.style.display = value ? 'block' : 'none';
    if (value && document.pointerLockElement) document.exitPointerLock();
    options.onOpenChange?.(value);
  };

  const showOptions = () => {
    if (!choice || choice.shown || !line?.full) return;
    choice.shown = true;
    more.style.display = 'none';
    list.classList.toggle('two', choice.options.length === 4 && choice.options.every((o) => o.text.length <= 34));
    list.replaceChildren(
      ...choice.options.map((option, i) => {
        const item = el('li');
        const button = el('button');
        button.append(el('span', 'num', `${i + 1}.`), option.text);
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          pick(i);
        });
        item.appendChild(button);
        return item;
      }),
    );
  };

  const render = () => {
    frame = 0;
    if (!line) return;
    if (line.started !== undefined && !line.full) {
      const count = shownChars(performance.now() - line.started, line.text.length, line.durationMs);
      text.textContent = line.text.slice(0, count);
      if (count >= line.text.length) line.full = true;
    }
    if (line.full) {
      text.textContent = line.text;
      if (choice) showOptions();
      else more.style.display = 'inline';
    } else {
      frame = requestAnimationFrame(render);
    }
  };

  const finishLine = () => {
    if (!line || line.full) return;
    line.full = true;
    render();
  };

  const pick = (index: number) => {
    if (!choice?.shown) return;
    const chosen = choice.options[index];
    if (!chosen) return;
    const { resolve } = choice;
    choice = undefined;
    list.replaceChildren();
    resolve(chosen.id);
    line?.done();
  };

  /** Click or Space: show the rest of the line, or move on from it. */
  const advance = () => {
    if (!open || !line) return;
    if (!line.full) finishLine();
    else if (!choice) {
      more.style.display = 'none';
      line.done();
    }
  };

  window.addEventListener('keydown', (event) => {
    if (!open || options.inputBlocked?.()) return;
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      if (!event.repeat) advance();
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
    if (digit) {
      event.preventDefault();
      // Only once the options are showing: keys pressed while the line types are ignored.
      pick(Number(digit[1]) - 1);
    }
  });
  box.addEventListener('click', () => {
    if (!options.inputBlocked?.()) advance();
  });

  return {
    say({ speaker, line: words, voice }) {
      // A new line supersedes the last, which counts as read.
      line?.done();
      cancelAnimationFrame(frame);
      list.replaceChildren();
      more.style.display = 'none';
      name.textContent = speaker;
      text.textContent = '';
      setOpen(true);
      return new Promise<void>((resolve) => {
        let settled = false;
        const current: NonNullable<typeof line> = {
          text: words,
          full: false,
          done: () => {
            if (settled) return;
            settled = true;
            resolve();
          },
        };
        line = current;
        const start = (durationMs?: number) => {
          if (line !== current || current.started !== undefined) return;
          current.started = performance.now();
          current.durationMs = durationMs;
          render();
        };
        if (!voice || !options.speaker) {
          start();
          return;
        }
        // Type over the speech when it comes in time; otherwise at the plain rate. Never wait on a failure.
        const timer = setTimeout(() => start(), SPEECH_WAIT_MS);
        void options.speaker.speak(words, voice).then(({ spoken, durationMs }) => {
          clearTimeout(timer);
          start(spoken ? durationMs : undefined);
        });
      });
    },

    choose(choices) {
      if (choice) choice.resolve('');
      setOpen(true);
      return new Promise<string>((resolve) => {
        choice = { options: choices, shown: false, resolve };
        // With no line (or a finished one) the options show at once.
        if (!line) line = { text: text.textContent ?? '', started: 0, full: true, done: () => undefined };
        showOptions();
      });
    },

    close() {
      cancelAnimationFrame(frame);
      const pending = choice;
      choice = undefined;
      pending?.resolve('');
      line?.done();
      line = undefined;
      list.replaceChildren();
      setOpen(false);
    },

    isOpen: () => open,

    state: () => ({
      open,
      speaker: name.textContent ?? '',
      text: text.textContent ?? '',
      full: line?.full ?? false,
      options: [...list.querySelectorAll('button')].map((b) => b.textContent ?? ''),
    }),
  };
}
