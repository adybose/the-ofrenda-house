import type { RoleFallbacks } from './types';

export const gardener: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Who is that? Keep off the beds."
    ],
    "neutral": [
      "Rain. Good for the earth. Bad for you."
    ],
    "warm": [
      "Come in out of the wet. Mind the pots."
    ]
  },
  "whoAreYou": [
    "Who are you?",
    "Where did you come from, in this rain?"
  ],
  "reaction": {
    "honest": [
      "Straight, like a good furrow."
    ],
    "evasive": [
      "Hm. Like a weed. All root, no flower."
    ],
    "lie": [
      "That is a lie. The earth knows."
    ]
  },
  "riddles": {
    "plants": {
      "question": "I sleep in the dark earth like the dead, and wake as something green. What am I?",
      "wrong": [
        "A stone",
        "A root",
        "A worm"
      ]
    },
    "marigolds": {
      "question": "Orange as fire, I make the path the dead follow home. What am I?",
      "wrong": [
        "A candle",
        "A rose",
        "A paper banner"
      ]
    },
    "bees": {
      "question": "Gold that runs, made by a thousand small workers who sting. What am I?",
      "wrong": [
        "Wax",
        "Syrup",
        "Pollen"
      ]
    }
  },
  "reward": [
    "I saw it from the garden. {fact}",
    "Plain truth, then. {fact}"
  ],
  "silence": [
    "No.",
    "Wrong. Go on."
  ]
};
