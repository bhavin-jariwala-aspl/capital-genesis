# Voice-over style guide

The on-screen captions are short labels. The voice-over is what a friendly, confident solutions consultant would
*say* while walking a prospect through the same screen. `vo/<slug>.json` holds one spoken line per caption cue;
[`lib/narrate.mjs`](../lib/narrate.mjs) speaks it instead of the caption.

## Format

```json
[
  { "n": 1, "caption": "Clients — Client 360", "vo": "Let's look at Client 360…" },
  { "n": 2, "caption": "…", "vo": "" }
]
```

- One entry per cue, in order. `caption` is the cue's **first caption line, copied exactly**: it is how a line is
  matched back to its cue if the video is re-recorded.
- `"vo": ""` means stay silent and let the screen speak. Use it for obvious UI moments ("Click any row to open it"),
  and no more than about one cue in eight.

## Voice

- Talk to the viewer: "you", "we", "let's". Use contractions: it's, she's, doesn't, we'll.
- Say **why it matters** before or instead of what's on screen. The viewer can read the screen; tell them the point.
  ("No duplicates, ever." "That's compliance built into the workflow, not a checklist.")
- Mix sentence lengths. A short punchy line after a longer one sounds human.
- Use a rhetorical question now and then, then answer it. Use natural connectors: "So", "Now", "Here's the thing",
  "Notice", "And that's it". Don't start every line the same way.
- Tell the persona's story: name them, what they want, what happens to them.
- Keep the facts in the captions exactly: names, roles, amounts, rules, stages. Never invent features, numbers or
  behaviour. When unsure, read the scenario in `modules/<slug>.mjs`.
- Use the same pronouns as the captions for each persona.
- No hype words (revolutionary, seamless, cutting-edge, game-changer) and no exclamation marks.
- Open the video with a hook (the problem this module solves). End with a short recap and what's next.
- The brand is always Genesis Capital / Genesis CRM.

## Written to be spoken

- No symbols or UI paths: no ▸ → · & / — ( ). Say "open Clients, then Parties, and click New".
- Money: "two point five million rupees", "fifty thousand US dollars". Percentages: "four point five percent".
- Dates as spoken: "the fifteenth of October".
- Acronyms the industry says as letters stay in capitals (KYC, AML, RM, BRN, AUM, FX, IBAN); write them plainly.
- Plain punctuation only: commas and full stops make the pauses; an ellipsis (…) makes a longer, dramatic pause.

## Timing

Each cue has a time budget (`seconds`, until the next caption). The voice speaks about **2.5 words per second**.
Aim for `seconds × 2.5` words or fewer. Going up to 30 % over is fine for an important moment (the video pauses on
that frame); never more. Shorter is often better.
