import type { RoleFallbacks } from './types';

export const bookkeeper: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Who is that? Stay where you are. Do not touch the books."
    ],
    "neutral": [
      "One, two, a visitor. That makes, ah, one visitor."
    ],
    "warm": [
      "Oh, a living soul. Come in, come in, mind the papers."
    ]
  },
  "whoAreYou": [
    "Who are you? Name, please, for the record.",
    "And you are? I must write it down, you understand."
  ],
  "reaction": {
    "honest": [
      "Good, good. That adds up."
    ],
    "evasive": [
      "That does not add up. Not at all."
    ],
    "lie": [
      "A false entry. I know a false entry when I see one."
    ]
  },
  "riddles": {
    "ledgers": {
      "question": "Every peso that came or went lives in my columns; I never forget, but I can be made to lie. What am I?",
      "wrong": [
        "A purse",
        "A safe",
        "A diary"
      ]
    },
    "chess": {
      "question": "I am the smallest soldier; walk me to the far side and I become a queen. What am I?",
      "wrong": [
        "A knight",
        "A bishop",
        "A rook"
      ]
    },
    "verses": {
      "question": "I am a little black well; dip in and poems come out. What am I?",
      "wrong": [
        "A teacup",
        "A thimble",
        "A vase"
      ]
    }
  },
  "reward": [
    "I counted everything, you know. Everything. {fact}",
    "Write this down. {fact}"
  ],
  "silence": [
    "No. Wrong. The account is closed.",
    "Incorrect. Leave me to my sums."
  ]
};
