// Turns a raw recording + timeline.json into the published tutorial:
//   <slug>.mp4  H.264, long waits trimmed, English subtitle track (mov_text) and chapter markers embedded
//   <slug>.srt / <slug>.vtt  the same captions as sidecar files
// The captions are also drawn on screen during recording, so they show in any player.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

function duration(file) {
  return Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}
const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
function stamp(t, sep) {
  const ms = Math.round(t * 1000);
  return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)}${sep}${pad(ms % 1000, 3)}`;
}

/**
 * Read the caption-number code (10 cells, bottom-left, drawn by studio.mjs) from every frame.
 * Returns Map<cue number, {start, end}> in raw-video seconds, or an empty map for older recordings.
 */
function readSyncCode(raw) {
  const FPS = 25;
  let buf;
  try {
    buf = execFileSync(FFMPEG, ['-v', 'error', '-i', raw, '-vf', `fps=${FPS},crop=80:6:0:894,scale=10:1:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 512 * 1024 * 1024 });
  } catch { return new Map(); }
  const vals = [];
  for (let i = 0; i + 10 <= buf.length; i += 10) {
    let n = 0;
    for (let b = 0; b < 10; b++) if (buf[i + b] > 127) n |= 1 << b;
    vals.push(n);
  }
  const spans = new Map();
  for (let i = 1; i < vals.length; i++) {
    const n = vals[i];
    if (!n || n !== vals[i - 1]) continue;          // stable for two frames
    const t = (i - 1) / FPS;
    const sp = spans.get(n);
    if (!sp) spans.set(n, { start: t, end: t + 2 / FPS });
    else sp.end = t + 2 / FPS;
  }
  return spans;
}

export function assemble({ rawDir, slug, outDir }) {
  const dir = path.join(rawDir, slug);
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const raw = path.join(dir, 'raw.webm');
  const D = duration(raw);
  // Playwright's video clock runs slightly differently from the script clock; map linearly.
  const k = D / tl.elapsed;
  const vt = (t) => Math.max(0, Math.min(D, t * k));
  // Exact caption timing from the on-screen sync code when the recording has it.
  const sync = readSyncCode(raw);
  const cueStart = (c) => (c.n && sync.get(c.n)?.start) ?? vt(c.start);
  const cueEnd = (c) => (c.n && sync.get(c.n)?.end) ?? vt(c.end);

  // Merge cut intervals (waits for the server) in video time.
  const cuts = tl.cuts.map(([a, b]) => [vt(a), vt(b)]).filter(([a, b]) => b - a > 1.2).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of cuts) {
    if (merged.length && a <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
    else merged.push([a, b]);
  }
  const removed = (t) => merged.reduce((s, [a, b]) => s + (a < t ? Math.min(b, t) - a : 0), 0);
  const atVideo = (v) => v - removed(v);
  const final = (t) => atVideo(vt(t));
  const total = D - removed(D);

  // Captions.
  const cues = tl.cues
    .map((c) => ({ ...c, s: atVideo(cueStart(c)), e: atVideo(cueEnd(c)) }))
    .filter((c) => c.e - c.s > 0.25);
  for (let i = 0; i < cues.length - 1; i++) cues[i].e = Math.min(cues[i].e, cues[i + 1].s);
  const lines = (c) => [c.text, c.sub].filter(Boolean).join('\n');
  const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.s, ',')} --> ${stamp(c.e, ',')}\n${lines(c)}\n`).join('\n');
  const vtt = 'WEBVTT\n\n' + cues.map((c) => `${stamp(c.s, '.')} --> ${stamp(c.e, '.')}\n${lines(c)}\n`).join('\n');
  fs.mkdirSync(outDir, { recursive: true });
  const srtPath = path.join(outDir, `${slug}.srt`);
  fs.writeFileSync(srtPath, srt);
  fs.writeFileSync(path.join(outDir, `${slug}.vtt`), vtt);

  // Chapters.
  const byNo = new Map(tl.cues.filter((c) => c.n).map((c) => [c.n, c]));
  const chapterAt = (c) => (c.cue && byNo.get(c.cue) ? atVideo(cueStart(byNo.get(c.cue))) : final(c.t));
  const chapters = [{ t: 0, title: 'Introduction' }, ...tl.chapters.map((c) => ({ t: chapterAt(c), title: `Step ${c.n} — ${c.name}` }))];
  let meta = ';FFMETADATA1\ntitle=' + tl.title.replace(/[=;#\\\n]/g, ' ') + '\n';
  chapters.forEach((c, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1].t : total;
    if (end - c.t < 0.5) return;
    meta += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.t * 1000)}\nEND=${Math.round(end * 1000)}\ntitle=${c.title.replace(/[=;#\\\n]/g, ' ')}\n`;
  });
  const metaPath = path.join(dir, 'chapters.txt');
  fs.writeFileSync(metaPath, meta);

  const sel = merged.length ? `select='not(${merged.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+')})',setpts=N/FRAME_RATE/TB,` : '';
  const mp4 = path.join(outDir, `${slug}.mp4`);
  execFileSync(FFMPEG, [
    '-y', '-v', 'error', '-i', raw, '-i', srtPath, '-i', metaPath,
    '-map', '[v]', '-map', '1:s', '-map_metadata', '2', '-map_chapters', '2',
    // Paint over the sync-code strip (bottom-left 80×6) with the rows just above it.
    '-filter_complex', `[0:v]split[a][b];[b]crop=80:6:0:888[p];[a][p]overlay=0:894,fps=25,${sel}format=yuv420p[v]`, '-r', '25',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-tune', 'stillimage',
    '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English',
    '-movflags', '+faststart', mp4,
  ], { stdio: 'inherit' });
  const synced = tl.cues.filter((c) => c.n && sync.has(c.n)).length;
  const out = { slug, title: tl.title, synced, duration: Math.round(duration(mp4)), chapters: chapters.map((c) => ({ t: Math.round(c.t), title: c.title })), cues: cues.length, issues: tl.issues };
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(out, null, 2));
  return out;
}
