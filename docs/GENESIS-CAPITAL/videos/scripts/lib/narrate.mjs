// Adds a spoken English narration track to a finished tutorial, timed to its .srt captions.
// Each cue speaks its voice-over line from vo/<slug>.json (written to be heard, see vo/STYLE.md), or the caption itself
// when the video has no line for it. The voice is Kokoro, a neural TTS that runs locally (lib/tts.py, models in
// .tts/), or macOS `say` when Kokoro is not installed or NARRATION_ENGINE=say. When a line is longer than the time
// before the next caption, it is first re-spoken a little faster; if it still does not fit, the video holds its last
// frame there until the voice finishes. Holds shift the captions (.srt/.vtt and the subtitle track) and the chapter
// markers to match. Running it again on a narrated video only redoes the audio.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VO_DIR = path.join(HERE, '..', 'vo');
const KOKORO_PY = path.join(HERE, '..', '.tts', 'venv', 'bin', 'python');
const ENGINE = process.env.NARRATION_ENGINE || (fs.existsSync(KOKORO_PY) ? 'kokoro' : 'say');
const VOICE = process.env.NARRATION_VOICE || (ENGINE === 'kokoro' ? 'af_heart' : 'Samantha');
const RATE = Number(process.env.NARRATION_RATE || 180);    // `say` only: words per minute
const MAX_SPEEDUP = 1.1;                                    // faster than this sounds rushed — hold the frame instead
const SR = 24000;
const GAP = 0.3;                                            // pause before the next caption is read

function duration(file) {
  return Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}
const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
function stamp(t, sep) {
  const ms = Math.round(t * 1000);
  return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)}${sep}${pad(ms % 1000, 3)}`;
}

const secs = (s) => { const [h, m, rest] = s.split(':'); return h * 3600 + m * 60 + Number(rest.replace(',', '.')); };
export function parseSrt(text) {
  return text.replace(/\r/g, '').trim().split(/\n\n+/).map((block) => {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return null;
    const [a, b] = lines[i].split('-->').map((x) => secs(x.trim()));
    return { s: a, e: b, lines: lines.slice(i + 1).filter(Boolean) };
  }).filter(Boolean);
}

/** Caption lines → something that sounds right when read aloud. */
export function speakable(lines) {
  return lines.map((l) => l.trim()
    .replace(/\s*[—–·•▸]\s*/g, ', ')
    .replace(/→/g, ' to ')
    .replace(/&/g, ' and ')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\s+/g, ' ')
    .replace(/[,:;]$/, '')
    .replace(/([^.!?])$/, '$1.'))
    .join(' ');
}

// Initialisms said as words; every other run of 2–6 capitals is spelled out (the TTS reads KYC as "kick").
const SAID_AS_WORDS = new Set(['FATCA', 'EBITDA', 'ALCO', 'IBAN', 'PEP', 'PEPs', 'NASDAQ', 'SWIFT', 'COVID']);
/** Final touches for the voice: currency, initialisms. */
export function forSpeech(text) {
  return text
    .replace(/MUR\s*([\d.,]+(?:\s*(?:million|billion|thousand|k|m|bn)\b)?)/gi, '$1 rupees')
    .replace(/\bMUR\b/g, 'rupees')
    .replace(/\b([A-Z]{2,6})(s?)\b/g, (w, caps, plural) => {
      if (SAID_AS_WORDS.has(w)) return w;
      const letters = caps.split('').map((c) => (c === 'A' ? 'Ay' : c));
      if (plural) letters[letters.length - 1] += "'s";
      return letters.join(' ');
    });
}

/** The spoken line of each cue: its vo/<slug>.json line (matched by first caption line, in order), else the caption. */
function linesFor(slug, cues) {
  const file = path.join(VO_DIR, `${slug}.json`);
  const vo = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  let j = 0;
  const missing = [];
  const lines = cues.map((c, i) => {
    const k = vo.findIndex((v, idx) => idx >= j && v.caption === c.lines[0]);
    if (k < 0) { if (vo.length) missing.push(i + 1); return speakable(c.lines); }
    j = k + 1;
    return vo[k].vo.trim();
  });
  if (missing.length) console.warn(`  ⚠ ${slug}: no voice-over line for cue ${missing.join(', ')} (caption read instead)`);
  return lines;
}

function pcmOf(file) {
  const buf = fs.readFileSync(file);
  let off = 12;                                              // walk RIFF chunks to "data"
  while (off < buf.length && buf.toString('ascii', off, off + 4) !== 'data') off += 8 + buf.readUInt32LE(off + 4);
  const len = Math.min(buf.readUInt32LE(off + 4), buf.length - off - 8);
  return new Int16Array(buf.buffer.slice(buf.byteOffset + off + 8, buf.byteOffset + off + 8 + len - (len % 2)));
}

/** 16-bit mono PCM of each { text, speed } (speed 1 = natural pace), in one batch. */
function synthAll(items, tmp) {
  const outs = items.map((_, i) => path.join(tmp, `cue-${i}.wav`));
  if (ENGINE === 'kokoro') {
    const jobs = path.join(tmp, 'jobs.json');
    const todo = items.map((it, i) => ({ text: forSpeech(it.text), speed: it.speed, out: outs[i] })).filter((it) => it.text);
    fs.writeFileSync(jobs, JSON.stringify({ voice: VOICE, items: todo }));
    if (todo.length) execFileSync(KOKORO_PY, [path.join(HERE, 'tts.py'), jobs], { stdio: ['ignore', 'ignore', 'inherit'] });
  } else {
    items.forEach((it, i) => it.text && execFileSync('say', ['-v', VOICE, '-r', String(Math.round(RATE * it.speed)),
      '--file-format=WAVE', `--data-format=LEI16@${SR}`, '-o', outs[i], forSpeech(it.text)]));
  }
  return items.map((it, i) => (it.text ? pcmOf(outs[i]) : new Int16Array(0)));
}

function wav(samples) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + samples.byteLength, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([h, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]);
}

function chaptersOf(mp4) {
  const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_chapters', '-show_format', '-of', 'json', mp4]).toString());
  return { title: j.format?.tags?.title ?? '', chapters: (j.chapters ?? []).map((c) => ({ t: Number(c.start_time), title: c.tags?.title ?? '' })) };
}

export function narrate({ mp4, srt }) {
  const total = duration(mp4);
  const cues = parseSrt(fs.readFileSync(srt, 'utf8'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'narrate-'));
  try {
    // 1. Speech for every caption, and where the video has to wait for it.
    const holds = [];                                        // [{ at: original time, d: seconds }]
    const texts = linesFor(path.basename(mp4, '.mp4'), cues);
    const slots = cues.map((c, i) => (i + 1 < cues.length ? cues[i + 1].s : total) - c.s - GAP);
    const speech = synthAll(texts.map((text) => ({ text, speed: 1 })), tmp);
    const redo = speech.map((p, i) => ({ i, need: p.length / SR / Math.max(slots[i], 0.1) })).filter((r) => r.need > 1.01);
    synthAll(redo.map((r) => ({ text: texts[r.i], speed: Math.min(MAX_SPEEDUP, r.need) })), tmp)
      .forEach((p, k) => { speech[redo[k].i] = p; });
    speech.forEach((pcm, i) => {
      const slotEnd = i + 1 < cues.length ? cues[i + 1].s : total;
      const over = pcm.length / SR - slots[i];
      if (over > 0.04) holds.push({ at: Math.min(slotEnd, total), d: Math.round(over * 25 + 0.5) / 25 });
    });
    // Original time → time in the held video. A hold at `at` sits just before the frame at `at`, so the caption
    // starting there moves after it.
    const shift = (t) => t + holds.reduce((s, h) => s + (h.at <= t + 1e-6 ? h.d : 0), 0);
    const held = holds.reduce((s, h) => s + h.d, 0);
    const newTotal = total + held;

    // 2. Narration track on the new timeline.
    const track = new Int16Array(Math.floor(newTotal * SR));
    cues.forEach((c, i) => track.set(speech[i].subarray(0, track.length - Math.round(shift(c.s) * SR)), Math.round(shift(c.s) * SR)));
    const dry = path.join(tmp, 'narration-dry.wav');
    fs.writeFileSync(dry, wav(track));
    // Broadcast-style loudness (-16 LUFS) so every video plays at the same level.
    const audio = path.join(tmp, 'narration.wav');
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', dry, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', audio]);

    // 3. Captions and chapters on the new timeline (a caption stays up while its frame is held).
    const moved = cues.map((c) => ({ ...c, s: shift(c.s), e: shift(c.e) }));
    for (let i = 0; i < moved.length - 1; i++) moved[i].e = Math.min(moved[i].e, moved[i + 1].s);
    if (holds.length) {
      fs.writeFileSync(srt, moved.map((c, i) => `${i + 1}\n${stamp(c.s, ',')} --> ${stamp(c.e, ',')}\n${c.lines.join('\n')}\n`).join('\n'));
      const vtt = srt.replace(/\.srt$/, '.vtt');
      fs.writeFileSync(vtt, 'WEBVTT\n\n' + moved.map((c) => `${stamp(c.s, '.')} --> ${stamp(c.e, '.')}\n${c.lines.join('\n')}\n`).join('\n'));
    }
    const { title, chapters } = chaptersOf(mp4);
    const marks = chapters.map((c) => ({ ...c, t: shift(c.t) }));
    let meta = ';FFMETADATA1\ntitle=' + title.replace(/[=;#\\\n]/g, ' ') + '\n';
    marks.forEach((c, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].t : newTotal;
      meta += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.t * 1000)}\nEND=${Math.round(end * 1000)}\ntitle=${c.title.replace(/[=;#\\\n]/g, ' ')}\n`;
    });
    const metaPath = path.join(tmp, 'chapters.txt');
    fs.writeFileSync(metaPath, meta);

    // 4. Video: copied as-is, or re-cut with the held frames.
    const out = mp4.replace(/\.mp4$/, '.narrated.tmp.mp4');
    let video = ['-map', '0:v', '-c:v', 'copy'];
    if (holds.length) {
      const cuts = [0, ...holds.map((h) => h.at), total];
      const parts = cuts.slice(0, -1).map((a, k) => {
        const hold = k < holds.length ? `,tpad=stop_mode=clone:stop_duration=${holds[k].d.toFixed(2)}` : '';
        return `[0:v]trim=start=${a.toFixed(3)}:end=${cuts[k + 1].toFixed(3)},setpts=PTS-STARTPTS${hold}[p${k}]`;
      });
      const graph = `${parts.join(';')};${parts.map((_, k) => `[p${k}]`).join('')}concat=n=${parts.length}:v=1:a=0,fps=25,format=yuv420p[v]`;
      video = ['-filter_complex', graph, '-map', '[v]', '-r', '25', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-tune', 'stillimage'];
    }
    // Chapters go in a second, copy-only pass: ffmpeg drops the chapter track when one pass re-encodes the video
    // and also writes subtitles and audio.
    const body = path.join(tmp, 'body.mp4');
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-i', mp4, '-i', srt, '-i', audio,
      ...video, '-map', '1:s', '-map', '2:a', '-map_chapters', '-1',
      '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English',
      '-c:a', 'aac', '-b:a', '128k', '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=English narration',
      body,
    ], { stdio: 'inherit' });
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-i', body, '-i', metaPath,
      '-map', '0', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', out,
    ], { stdio: 'inherit' });
    fs.renameSync(out, mp4);
    return { cues: cues.length, holds: holds.length, held: Math.round(held), duration: Math.round(newTotal) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
