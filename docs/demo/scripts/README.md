# Tutorial video recorder

These scripts record the tutorial videos in [docs/demo](..). Each script drives the real Genesis CRM in Chrome with
Playwright, and each video is one end-to-end process. Every record, stage move and approval goes through the UI
against the running app. The API is used only to look up record ids and to wait for automation to finish.

## Requirements

- The app running locally: `make start` (frontend :5173, backend :3001), on the local demo database.
- Google Chrome, `ffmpeg` and `ffprobe` on the `PATH` (`brew install ffmpeg`).
- macOS `say` for the narration (voice `Samantha` by default; pick another with `NARRATION_VOICE`, and the pace in
  words per minute with `NARRATION_RATE`, default 180).
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

[`lib/narrate.mjs`](lib/narrate.mjs) reads each caption aloud as it appears, so the voice always says what is on screen.
When a caption's speech is longer than the time before the next caption, it is spoken a little faster (up to 15 %);
if it still does not fit, the video holds that frame until the voice finishes, and the captions, `.srt`/`.vtt` files
and chapter markers move to match. `assemble` runs it on every video it builds. Running `narrate.mjs` again on a
narrated video only redoes the audio.
