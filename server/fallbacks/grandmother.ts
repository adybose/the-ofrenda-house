import type { RoleFallbacks } from './types';

export const grandmother: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Who is it? These old eyes do not like strangers."
    ],
    "neutral": [
      "Ah. The storm brings what it brings."
    ],
    "warm": [
      "Come here, child. Let me look at you."
    ]
  },
  "whoAreYou": [
    "Who are you, child? Whose face is that you are wearing?",
    "Tell me your name. Names matter, tonight of all nights."
  ],
  "reaction": {
    "honest": [
      "The truth sits well on you, child."
    ],
    "evasive": [
      "He who walks around the well never drinks."
    ],
    "lie": [
      "A lie has short legs, child. It will not get far."
    ]
  },
  "riddles": {
    "memory": {
      "question": "I hold a face that is gone, silver and paper, still as a corpse. What am I?",
      "wrong": [
        "A mirror",
        "A locket",
        "A painting"
      ]
    },
    "embroidery": {
      "question": "I have one eye and a long tail of thread; I pierce the cloth a thousand times. What am I?",
      "wrong": [
        "A pin",
        "A thimble",
        "A hook"
      ]
    },
    "ghost stories": {
      "question": "I walk the riverbank in white, weeping for the children I drowned. Who am I?",
      "wrong": [
        "La Catrina",
        "El Cucuy",
        "La Malinche"
      ]
    }
  },
  "reward": [
    "I remember everything, child. {fact}",
    "Old women see what others miss. {fact}"
  ],
  "silence": [
    "No, child. Not that.",
    "Wrong. Go with God, then."
  ]
};
