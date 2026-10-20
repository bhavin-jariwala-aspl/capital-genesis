// Adds (or redoes) the spoken narration on finished videos in docs/demo/, from their .srt captions.
//   node narrate.mjs                  every video
//   node narrate.mjs 05-retail        one (or several) by file-name prefix
// NARRATION_VOICE (Kokoro voice, default af_heart) picks the voice; NARRATION_ENGINE=say uses macOS say.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { narrate } from './lib/narrate.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wanted = process.argv.slice(2);
const all = fs.readdirSync(OUT).filter((f) => /^\d\d-.*\.mp4$/.test(f) && !f.includes('.tmp.')).map((f) => f.replace(/\.mp4$/, '')).sort();
const list = wanted.length ? all.filter((s) => wanted.some((w) => s.startsWith(w))) : all;

for (const slug of list) {
  const r = narrate({ mp4: path.join(OUT, `${slug}.mp4`), srt: path.join(OUT, `${slug}.srt`) });
  const m = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  console.log(`🔊 ${slug}.mp4 ${m(r.duration)} · ${r.cues} captions spoken · ${r.holds} pauses for the voice (+${r.held}s)`);
}
