// The period look shared by every overlay (spec 10): system serif fonts only (no web fonts), cream
// on near-black for high contrast, thin brass rules. One stylesheet, injected once.

export const SERIF = 'Georgia, "Times New Roman", Times, serif';

const CSS = `
.ofr-panel {
  font-family: ${SERIF};
  color: #efe4c8;
  background: rgba(12, 9, 6, 0.9);
  border: 1px solid rgba(201, 162, 90, 0.55);
  box-shadow: 0 0 0 4px rgba(12, 9, 6, 0.6), 0 8px 30px rgba(0, 0, 0, 0.7);
}
.ofr-rule { border: 0; border-top: 1px solid rgba(201, 162, 90, 0.45); margin: 0.5em 0; }
.ofr-name { font-variant: small-caps; letter-spacing: 0.08em; color: #d9b46c; }

#dialogue {
  position: fixed; left: 50%; bottom: 4vh; transform: translateX(-50%);
  width: min(900px, 92vw); box-sizing: border-box; padding: 18px 26px 20px;
  font-size: clamp(17px, 1.15vw + 6px, 26px); line-height: 1.45; z-index: 10; cursor: pointer;
}
#dialogue-speaker { font-size: 0.85em; margin-bottom: 0.3em; }
#dialogue-text { min-height: 2.9em; white-space: pre-wrap; }
#dialogue-more { float: right; color: #d9b46c; animation: ofr-blink 1.1s steps(2, start) infinite; }
@keyframes ofr-blink { to { visibility: hidden; } }
#dialogue-options { list-style: none; margin: 0.6em 0 0; padding: 0; }
#dialogue-options button {
  display: block; width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer;
  background: transparent; border: 1px solid transparent; padding: 0.25em 0.5em; margin: 0.1em 0;
}
#dialogue-options button:hover, #dialogue-options button:focus-visible {
  border-color: rgba(201, 162, 90, 0.7); background: rgba(201, 162, 90, 0.12); outline: none;
}
#dialogue-options .num { color: #d9b46c; display: inline-block; width: 1.6em; }

#clue-toast {
  position: fixed; left: 50%; top: 5vh; transform: translateX(-50%); z-index: 11;
  width: min(620px, 88vw); box-sizing: border-box; padding: 12px 20px; pointer-events: none;
  font-size: clamp(15px, 0.8vw + 6px, 21px); transition: opacity 0.6s;
}
#clue-toast .label { font-size: 0.8em; }

#journal {
  position: fixed; inset: 4vh 4vw; z-index: 20; overflow: auto; box-sizing: border-box;
  padding: 24px 34px; font-size: clamp(15px, 0.7vw + 7px, 20px); line-height: 1.4;
}
#journal h2 { margin: 0; font-weight: normal; font-size: 1.6em; letter-spacing: 0.05em; }
#journal h3 { margin: 0.8em 0 0.3em; font-weight: normal; font-size: 1.1em; }
#journal .time { float: right; }
#journal .kinds { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 22px; }
#journal .clue-card {
  display: flex; gap: 10px; align-items: flex-start; margin: 0.4em 0; padding: 8px;
  border: 1px solid rgba(201, 162, 90, 0.3); cursor: pointer; background: rgba(239, 228, 200, 0.03);
}
#journal .clue-card.doubted .text { text-decoration: line-through; opacity: 0.6; }
#journal .clue-card .doubt { display: none; font-size: 0.8em; color: #c97a5a; }
#journal .clue-card.doubted .doubt { display: block; }
#journal .portrait { width: 36px; height: 48px; image-rendering: pixelated; flex: none; border: 1px solid rgba(201, 162, 90, 0.4); }
#journal ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
#journal .met li { display: flex; align-items: center; gap: 8px; }
#journal .empty { opacity: 0.55; font-style: italic; }
#journal .hint { opacity: 0.6; font-size: 0.85em; }

#journal-button {
  position: fixed; left: 16px; top: 16px; z-index: 6; cursor: pointer; padding: 5px 12px;
  font-size: 15px; letter-spacing: 0.04em;
}
#journal-button:hover, #journal-button:focus-visible { border-color: rgba(217, 180, 108, 0.9); outline: none; }
#journal-button .badge {
  display: inline-block; width: 8px; height: 8px; margin-left: 8px; border-radius: 50%;
  background: #d9b46c; vertical-align: middle;
}
#clue-toast .where { font-size: 0.8em; opacity: 0.75; margin-top: 0.3em; }

.hud-slot {
  position: fixed; z-index: 5; font-family: ${SERIF}; color: #efe4c8; font-size: 15px;
  padding: 4px 10px; background: rgba(0, 0, 0, 0.45); pointer-events: none;
}
`;

let injected = false;

/** Adds the shared stylesheet to the page, once. */
export function useTheme(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** A new element with a class list and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
