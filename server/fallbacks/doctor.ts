import type { RoleFallbacks } from './types';

export const doctor: RoleFallbacks = {
  "greeting": {
    "wary": [
      "Keep your distance. Who called for you?"
    ],
    "neutral": [
      "A patient? At this hour? How irregular."
    ],
    "warm": [
      "Come in, come in. You look pale. Sit."
    ]
  },
  "whoAreYou": [
    "And who might you be? I do not recall your case.",
    "Name and complaint, if you please."
  ],
  "reaction": {
    "honest": [
      "A clean diagnosis. Good."
    ],
    "evasive": [
      "Symptoms, not a cause. Try again."
    ],
    "lie": [
      "You bluff like a man with no cards."
    ]
  },
  "riddles": {
    "tonics": {
      "question": "Brown glass, a cork, a spoonful at bedtime, and you sleep a little deeper each night. What am I?",
      "wrong": [
        "A wine glass",
        "A perfume flask",
        "An inkwell"
      ]
    },
    "cards": {
      "question": "Fifty-two faces, four suits; I took a fortune and gave none back. What am I?",
      "wrong": [
        "A roulette wheel",
        "A pair of dice",
        "A purse"
      ]
    },
    "stars": {
      "question": "One eye of glass pointed at heaven; I bring the far lights near. What am I?",
      "wrong": [
        "A microscope",
        "A magnifying glass",
        "A lantern"
      ]
    }
  },
  "reward": [
    "Between doctor and patient, then. {fact}",
    "My professional opinion, for what it is worth. {fact}"
  ],
  "silence": [
    "Incorrect. The consultation is over.",
    "No. Nothing more to be done."
  ]
};
