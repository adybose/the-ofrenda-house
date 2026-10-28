import type { RoleFallbacks } from './types';

export const patriarch: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Who dares stand in my house without leave?"
    ],
    "neutral": [
      "Another one. The house keeps bringing them."
    ],
    "warm": [
      "Come in, then, out of the storm. Few are welcome here."
    ]
  },
  "whoAreYou": [
    "State your name and your business in my house.",
    "Who sent you here, and from where?"
  ],
  "reaction": {
    "honest": [
      "Hm. An honest answer. That is rarer here than gold."
    ],
    "evasive": [
      "You dance around the question like a clerk around a debt."
    ],
    "lie": [
      "Do not lie in my house. I can smell it."
    ]
  },
  "riddles": {
    "clocks": {
      "question": "I swing but never leave, I count but cannot speak; stop me and the hours die. What am I?",
      "wrong": [
        "A church bell",
        "A weathervane",
        "A rocking chair"
      ]
    },
    "silver": {
      "question": "Men died in the dark to bring me up; I shine on the table and tarnish in the drawer. What am I?",
      "wrong": [
        "Gold",
        "Coal",
        "Copper"
      ]
    },
    "letters": {
      "question": "I am pressed hot and set cold; break me and every secret spills. What am I?",
      "wrong": [
        "A candle",
        "A ribbon",
        "A lock"
      ]
    }
  },
  "reward": [
    "Listen well, for I say it once. {fact}",
    "So. You have earned this much. {fact}"
  ],
  "silence": [
    "Wrong. Then we have nothing more to say.",
    "No. Leave me to my clocks."
  ]
};
