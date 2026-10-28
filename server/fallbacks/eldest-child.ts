import type { RoleFallbacks } from './types';

export const eldestChild: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Who are you to walk in here? This is my room."
    ],
    "neutral": [
      "A guest. How tiresome. How wonderful."
    ],
    "warm": [
      "Oh, finally, someone. Stay. Please stay."
    ]
  },
  "whoAreYou": [
    "Who are you? Are you here to take what is mine too?",
    "Tell me who you are. Everyone in this house lies about who they are."
  ],
  "reaction": {
    "honest": [
      "You mean it. I can tell. Nobody here ever meant anything."
    ],
    "evasive": [
      "You sound like Mother. Nothing but riddles."
    ],
    "lie": [
      "Liar. You are all liars."
    ]
  },
  "riddles": {
    "piano": {
      "question": "I am black or white, struck a thousand times; press me and I sing one note. What am I?",
      "wrong": [
        "A domino",
        "A drum",
        "A chess square"
      ]
    },
    "horses": {
      "question": "Nailed to a foot, hung over a door for luck; turn me down and luck runs out. What am I?",
      "wrong": [
        "A saddle",
        "A spur",
        "A stirrup"
      ]
    },
    "poems": {
      "question": "Ripped from a book in a rage, the last lines lost forever. What am I?",
      "wrong": [
        "A letter",
        "A ticket",
        "A banknote"
      ]
    }
  },
  "reward": [
    "Fine. You may as well have it. {fact}",
    "I will tell you, since no one ever listened. {fact}"
  ],
  "silence": [
    "Wrong. Of course you are wrong.",
    "No. Get out of my room."
  ]
};
