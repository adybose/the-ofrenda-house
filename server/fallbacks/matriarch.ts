import type { RoleFallbacks } from './types';

export const matriarch: RoleFallbacks = {
  "greeting": {
    "wary": [
      "You are dripping on my floor. Who are you to come in uninvited?"
    ],
    "neutral": [
      "A visitor, at this hour. How unusual, querido."
    ],
    "warm": [
      "Come, sit. It has been so long since anyone called on us."
    ]
  },
  "whoAreYou": [
    "And whom do I have the pleasure of receiving?",
    "Tell me who you are, and who your people are."
  ],
  "reaction": {
    "honest": [
      "How refreshing. Honesty is not common in this house."
    ],
    "evasive": [
      "How very discreet of you."
    ],
    "lie": [
      "Please. I have heard better lies at my own table."
    ]
  },
  "riddles": {
    "orchids": {
      "question": "I cling to bark, I drink the air, I bloom once a year for the patient. What am I?",
      "wrong": [
        "A rose",
        "A fern",
        "A lily"
      ]
    },
    "devotion": {
      "question": "Fifty-nine beads and a cross; fingers walk me every dusk. What am I?",
      "wrong": [
        "A necklace",
        "An abacus",
        "A bracelet"
      ]
    },
    "dinners": {
      "question": "I am small with a tongue of metal; one ring and the servants run. What am I?",
      "wrong": [
        "A gong",
        "A whistle",
        "A rattle"
      ]
    }
  },
  "reward": [
    "Very well. Between us. {fact}",
    "You may as well know. {fact}"
  ],
  "silence": [
    "How disappointing. Good night.",
    "No. You may see yourself out."
  ]
};
