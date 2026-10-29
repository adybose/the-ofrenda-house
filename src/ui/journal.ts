import type { CaseFile, CharacterId, FactKind } from '../case/types';
import { STREAMS, createRng, type Seed } from '../core/rng';
import { generatePortrait } from '../render/portraits';
import type { ClueCard } from './clue-card';
import { el, useTheme } from './theme';

export interface Journal {
  /** Keeps a clue card, shows it on screen for a moment, and counts its spirit as met. */
  addClue(card: ClueCard): void;
  addKey(keyId: string): void;
  /** A member of the household the player has spoken with. */
  meet(characterId: CharacterId): void;
  /** Spec 14's candle clock fills this. */
  setTimeLeft(text: string): void;
  toggle(): void;
  isOpen(): boolean;
}

const KINDS: { kind: FactKind; title: string }[] = [
  { kind: 'motive', title: 'Motive' },
  { kind: 'means', title: 'Means' },
  { kind: 'opportunity', title: 'Opportunity' },
  { kind: 'alibi', title: 'Alibi' },
];

/** How long a new clue stays on screen. */
const TOAST_MS = 4500;

const spaced = (camel: string) => camel.replace(/([A-Z])/g, ' $1').toLowerCase();

/**
 * The journal (spec 10), opened and closed with J: every clue card grouped by kind, each with its
 * spirit's name and portrait and a click to mark it doubted; the household met so far; the keys held;
 * and the time left. `onOpenChange` lets the game pause the world while it is open.
 */
export function createJournal(options: { caseFile: CaseFile; seed: Seed; onOpenChange?: (open: boolean) => void }): Journal {
  useTheme();
  const { caseFile } = options;
  const character = (id: CharacterId) => caseFile.characters.find((c) => c.id === id)!;
  const clues: ClueCard[] = [];
  const doubted = new Set<string>();
  const keys: string[] = [];
  const met: CharacterId[] = [];
  let timeLeft = '—';
  let open = false;

  // The same portraits as on the walls: the render stream, forked per character.
  const render = createRng(options.seed).fork(STREAMS.render);
  const portraits = new Map<CharacterId, string>();
  const portrait = (id: CharacterId) => {
    let url = portraits.get(id);
    if (!url) {
      const image = generatePortrait(character(id), 'normal', render.fork(`portrait:${id}`));
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
      url = canvas.toDataURL();
      portraits.set(id, url);
    }
    const img = el('img', 'portrait');
    img.src = url;
    img.alt = character(id).name;
    return img;
  };

  const page = el('div', 'ofr-panel');
  page.id = 'journal';
  page.style.display = 'none';
  document.body.appendChild(page);

  const toast = el('div', 'ofr-panel');
  toast.id = 'clue-toast';
  toast.style.display = 'none';
  document.body.appendChild(toast);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const hideToast = () => {
    clearTimeout(toastTimer);
    toast.style.display = 'none';
  };

  const keyName = (keyId: string) => {
    const id = keyId.replace(/^key:/, '') as CharacterId;
    const owner = caseFile.characters.find((c) => c.id === id);
    return owner ? `Key to ${owner.shortName}'s ${spaced(owner.roomKind)}` : keyId;
  };

  const draw = () => {
    const kinds = el('div', 'kinds');
    for (const { kind, title } of KINDS) {
      const column = el('section');
      column.dataset.kind = kind;
      column.appendChild(el('h3', 'ofr-name', title));
      const mine = clues.filter((c) => c.kind === kind);
      if (!mine.length) column.appendChild(el('div', 'empty', 'Nothing yet.'));
      for (const clue of mine) {
        const card = el('div', `clue-card${doubted.has(clue.factId) ? ' doubted' : ''}`);
        card.title = 'Click to mark as doubted';
        const words = el('div');
        words.append(el('div', 'text', clue.text), el('div', 'ofr-name', character(clue.holderId).name), el('div', 'doubt', 'Doubted'));
        card.append(portrait(clue.holderId), words);
        card.addEventListener('click', () => {
          if (doubted.has(clue.factId)) doubted.delete(clue.factId);
          else doubted.add(clue.factId);
          card.classList.toggle('doubted', doubted.has(clue.factId));
        });
        column.appendChild(card);
      }
      kinds.appendChild(column);
    }
    const household = el('section', 'met');
    household.appendChild(el('h3', 'ofr-name', 'The household'));
    const people = el('ul');
    for (const id of met) {
      const item = el('li');
      item.append(portrait(id), character(id).name);
      people.appendChild(item);
    }
    household.appendChild(met.length ? people : el('div', 'empty', 'You have met no one yet.'));
    const held = el('section', 'keys');
    held.appendChild(el('h3', 'ofr-name', 'Keys'));
    const keyList = el('ul');
    for (const key of keys) keyList.appendChild(el('li', '', keyName(key)));
    held.appendChild(keys.length ? keyList : el('div', 'empty', 'No keys.'));

    const header = el('div');
    header.append(el('span', 'time ofr-name', `Time left: ${timeLeft}`), el('h2', '', 'Journal'));
    page.replaceChildren(header, el('hr', 'ofr-rule'), el('h3', 'ofr-name', 'Clues'), kinds, household, held, el('p', 'hint', 'Press J to close. Click a clue to mark it as doubted.'));
  };

  const setOpen = (value: boolean) => {
    if (open === value) return;
    open = value;
    if (value) {
      draw();
      // The new clue is on the page now; its toast would only show through.
      hideToast();
      if (document.pointerLockElement) document.exitPointerLock();
    }
    page.style.display = value ? 'block' : 'none';
    options.onOpenChange?.(value);
  };

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyJ' || event.repeat) return;
    event.preventDefault();
    setOpen(!open);
  });

  return {
    addClue(card) {
      if (!clues.some((c) => c.factId === card.factId)) clues.push(card);
      if (!met.includes(card.holderId)) met.push(card.holderId);
      if (open) {
        draw();
        return;
      }
      toast.replaceChildren(el('div', 'label ofr-name', `A clue, from ${character(card.holderId).name}`), el('div', '', card.text));
      toast.style.display = 'block';
      toast.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toastTimer = setTimeout(() => (toast.style.display = 'none'), 700);
      }, TOAST_MS);
    },
    addKey(keyId) {
      if (!keys.includes(keyId)) keys.push(keyId);
      if (open) draw();
    },
    meet(id) {
      if (!met.includes(id)) met.push(id);
      if (open) draw();
    },
    setTimeLeft(text) {
      timeLeft = text;
      if (open) draw();
    },
    toggle: () => setOpen(!open),
    isOpen: () => open,
  };
}
