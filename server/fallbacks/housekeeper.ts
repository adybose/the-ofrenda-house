import type { RoleFallbacks } from './types';

export const housekeeper: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Who opened that door? I keep every key in this house."
    ],
    "neutral": [
      "Wipe your feet. The dead still like a clean floor."
    ],
    "warm": [
      "Ay, look at you, soaked through. Come in, quickly."
    ]
  },
  "whoAreYou": [
    "Who are you, and which door let you in?",
    "Name yourself. I like to know who walks my halls."
  ],
  "reaction": {
    "honest": [
      "Good. I can work with honest."
    ],
    "evasive": [
      "Hm. You keep your doors shut, I see."
    ],
    "lie": [
      "Liar. The cards told me a liar would come."
    ]
  },
  "riddles": {
    "keys": {
      "question": "I jingle at a hip and open every door but the last one. What am I?",
      "wrong": [
        "A coin purse",
        "A rosary",
        "A chain of medals"
      ]
    },
    "fortunes": {
      "question": "The Tower, the Moon, Death itself, and none of us ever lies. What am I?",
      "wrong": [
        "A playing card",
        "A holy picture",
        "A calendar page"
      ]
    },
    "linen": {
      "question": "I am cooked from corn and make sheets stand stiff as the dead. What am I?",
      "wrong": [
        "Lye",
        "Salt",
        "Soap"
      ]
    }
  },
  "reward": [
    "I see everything in this house. {fact}",
    "Listen, and do not tell the Señora. {fact}"
  ],
  "silence": [
    "Wrong. Out of my sight.",
    "No. Go on, then. Shoo."
  ]
};
