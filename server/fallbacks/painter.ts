import type { RoleFallbacks } from './types';

export const painter: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Stand back from the canvases. Who let you in?"
    ],
    "neutral": [
      "You have a face I have not painted. Strange."
    ],
    "warm": [
      "Come closer, into the light. I have waited so long for a living face."
    ]
  },
  "whoAreYou": [
    "Who are you? Turn your face to the window so I can see.",
    "Tell me who you are. I paint everyone who comes here."
  ],
  "reaction": {
    "honest": [
      "Yes. That rings true, like a true colour."
    ],
    "evasive": [
      "You give me shadows, not a face."
    ],
    "lie": [
      "A false colour. I can always tell."
    ]
  },
  "riddles": {
    "portraits": {
      "question": "I have a wooden body and a soft head; I give faces to the dead. What am I?",
      "wrong": [
        "A chisel",
        "A quill",
        "A comb"
      ]
    },
    "night painting": {
      "question": "I was the only sun I painted by; I wept wax while I worked. What am I?",
      "wrong": [
        "Moonlight",
        "An oil lamp",
        "The fireplace"
      ]
    },
    "pigments": {
      "question": "Ground from tiny bodies on the nopal, I bleed the reddest red. What am I?",
      "wrong": [
        "Indigo",
        "Ochre",
        "Charcoal"
      ]
    }
  },
  "reward": [
    "I saw things, painting here at night. {fact}",
    "Here is what my eyes kept. {fact}"
  ],
  "silence": [
    "No. The picture fades.",
    "Wrong. Go, before the paint dries over you too."
  ]
};
