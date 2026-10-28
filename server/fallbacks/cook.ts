import type { RoleFallbacks } from './types';

export const cook: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Out of my kitchen, whoever you are."
    ],
    "neutral": [
      "You smell of rain. Hungry? There is nothing left to eat."
    ],
    "warm": [
      "Come by the stove, mija, mijo. Warm your hands."
    ]
  },
  "whoAreYou": [
    "Who are you, then, coming in the back way?",
    "And whose child are you, to come knocking on such a night?"
  ],
  "reaction": {
    "honest": [
      "Good. Plain and honest, like bread."
    ],
    "evasive": [
      "Hm. Too much salt and not enough meat in that answer."
    ],
    "lie": [
      "That is a lie, and it smells burnt."
    ]
  },
  "riddles": {
    "mole": {
      "question": "Bitter, dark, the Aztecs drank me; I melt into the sauce that takes three days. What am I?",
      "wrong": [
        "Coffee",
        "Cinnamon",
        "Chilli"
      ]
    },
    "bread": {
      "question": "Baked with bones on top for the first of November, sweet with orange blossom. What am I?",
      "wrong": [
        "A tamale",
        "A tortilla",
        "A sugar skull"
      ]
    },
    "corn": {
      "question": "Three stone legs, a stone hand to rub on me; the masa comes from my back. What am I?",
      "wrong": [
        "A comal",
        "A molcajete",
        "A clay pot"
      ]
    }
  },
  "reward": [
    "I fed this whole house. I saw what went into the pots. {fact}",
    "Here, take this with you. {fact}"
  ],
  "silence": [
    "Wrong. The fire is out.",
    "No. Go hungry, then."
  ]
};
