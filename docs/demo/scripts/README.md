# Tutorial video recorder

These scripts record the tutorial videos in [docs/demo](..). Each script drives the real Genesis CRM in Chrome with
Playwright, and each video is one end-to-end process. Every record, stage move and approval goes through the UI
against the running app. The API is used only to look up record ids and to wait for automation to finish.

## Requirements

- The app running locally: `make start` (frontend :5173, backend :3001), on the local demo database.
- Google Chrome, `ffmpeg` and `ffprobe` on the `PATH` (`brew install ffmpeg`).
- For the narration voice, Kokoro (a neural text-to-speech model that runs locally, free, Apache-2.0), installed once:
  ```bash
  mkdir -p .tts && python3.13 -m venv .tts/venv && .tts/venv/bin/pip install kokoro-onnx soundfile
  curl -L -o .tts/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  curl -L -o .tts/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
  ```
  Without it the narration falls back to macOS `say`.
- Once: `cd docs/demo/scripts && npm install && npx playwright install ffmpeg`.

## Commands

```bash
node run.mjs                        # record and assemble every video in modules/
node run.mjs 05-retail-lending      # one video (prefix match, several allowed)
node run.mjs --assemble-only 05     # rebuild the MP4 and captions from the last raw recording
node narrate.mjs 05                 # redo only the spoken narration of a finished video (all videos without arguments)
node probe.mjs GCRM1 /module/87/object/163 .raw/x.png   # sign in, open a page, screenshot + list its controls
```

Raw recordings go to `.raw/<slug>/` (`raw.webm`, `timeline.json`, `error.png` on failure). Finished files go to
`docs/demo/`:

| File | Contents |
| ---- | -------- |
| `<slug>.mp4` | H.264 1440×900, captions drawn on screen and read aloud (English narration track), plus an English subtitle track and chapter markers |
| `<slug>.srt` / `<slug>.vtt` | The same captions as sidecar subtitle files |

## Writing a scenario

A scenario is `modules/NN-name.mjs`. It exports `title` and a default `async (S) => {}`:

```js
export const title = 'Service & Complaints';
export default async function run(S) {
  await S.go('/login');
  await S.card({ eyebrow: 'Genesis CRM · Tutorial 17', title: 'Service & Complaints', text: '…', bullets: ['…'] });
  await S.step(1, 'Log the complaint', 'Caption line', 'Smaller second line');
  await S.login('GCRM1', 'why this person');
  await S.newRecord('service_request');
  await S.fill('service_request', { party: 'Deepak Seegoolam', business_unit: 'LND', request_type: 'complaint' });
  const rec = await S.submit();
  await S.openObject('service_request', { view: 'Pipeline' });
  await S.drag('Deepak Seegoolam', 'New', 'Acknowledged');
  await S.approve('Credit approval: …', 'Comment');
}
```

| Helper | Does |
| ------ | ---- |
| `card({eyebrow,title,text,bullets,foot}, ms)` | Full-screen title card |
| `step(n, name, text, sub)` | Starts a chapter and shows a caption with a "Step n · name" eyebrow |
| `say(text, sub)` / `clear()` | Caption only (each one becomes a subtitle cue) |
| `login(id, why)` / `logout()` | Visible sign-in as a demo persona (`PEOPLE` lists them) |
| `go(path)`, `openObject(name, {view})`, `openRecord(name, id)`, `view('Pipeline' \| 'Table')`, `tab('Docs')` | Navigation |
| `newRecord(name)`, `editRecord(name, id, formTab?)`, `fill(name, {field: value})`, `submit({expectFail})` | Forms; `fill` picks the control from the field type, and a lookup value is the text to search and pick |
| `drag(cardText, fromStage, toStage, {expectFail})` | Moves a card on the pipeline board and checks the server's answer |
| `approve(match, comment, {action})` | Decides an item in Tools ▸ Approvals |
| `moveTo(locator)`, `click`, `clickText`, `highlight`, `scroll`, `type` | Visible mouse and keyboard |
| `records(id, objectId)`, `api(id, method, path)`, `poll(fn)` | Lookups and waits (never used to perform a user's action) |
| `issue(text)` | Records an app problem found while recording (printed after assembly) |

Stage and field names in `drag` and `fill` are the labels and field names shown in the Builder. Waits for the server
longer than 2.5 s are trimmed out of the video automatically.

## Narration

Each caption cue has a spoken line in [`vo/<slug>.json`](vo), written to be heard rather than read: conversational,
in the second person, explaining why a step matters (see [`vo/STYLE.md`](vo/STYLE.md)). The on-screen captions stay
short labels. A line is matched to its cue by the caption's first line, so re-recording a video keeps its lines as
long as the captions don't change. A cue with no line has its caption read instead (a warning names it), and
`"vo": ""` keeps a cue silent.

[`lib/narrate.mjs`](lib/narrate.mjs) speaks the lines with Kokoro ([`lib/tts.py`](lib/tts.py), voice `af_heart` by
default; set `NARRATION_VOICE`, for example `am_michael` or `bf_emma`). `NARRATION_ENGINE=say` uses macOS `say`
instead. Initialisms are spelled out for the voice (KYC as "K Y C"; FATCA and EBITDA stay words), and the track is
normalised to −16 LUFS. When a line is longer than the time before the next caption, it is spoken up to 10 % faster;
if it still does not fit, the video holds that frame until the voice finishes, and the captions, `.srt`/`.vtt` files
and chapter markers move to match. `assemble` runs it on every video it builds.

To change the voice-over on a finished video, edit its `vo/<slug>.json` and rebuild with `node run.mjs
--assemble-only <slug>` (no app needed). Running `narrate.mjs` on its own keeps the frame holds already baked
into the video, so use it only for changes that don't affect timing, such as trying another voice.
