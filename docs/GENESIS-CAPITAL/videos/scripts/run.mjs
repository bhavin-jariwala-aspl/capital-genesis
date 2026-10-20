// Records and assembles tutorial videos.
//   node run.mjs                     all modules in modules/
//   node run.mjs 05-retail-lending   one (or several) by file name
//   node run.mjs --assemble-only 05-retail-lending
// Raw recordings go to RAW_DIR (default ./.raw); finished videos and captions to docs/genesis-capital/videos/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { session } from './lib/studio.mjs';
import { assemble } from './lib/assemble.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(process.env.RAW_DIR || path.join(here, '.raw'));
const OUT = path.resolve(here, '..');
const args = process.argv.slice(2);
const assembleOnly = args.includes('--assemble-only');
const wanted = args.filter((a) => !a.startsWith('--'));
const all = fs.readdirSync(path.join(here, 'modules')).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).sort();
const list = wanted.length ? all.filter((s) => wanted.some((w) => s.startsWith(w))) : all;

let failed = 0;
for (const slug of list) {
  const mod = await import(pathToFileURL(path.join(here, 'modules', `${slug}.mjs`)).href);
  if (!assembleOnly) {
    const S = await session({ slug, title: mod.title, rawDir: RAW });
    let ok = true;
    try {
      await mod.default(S);
    } catch (e) {
      ok = false; failed++;
      S.log('ERROR', e.stack || e.message);
      await S.p.screenshot({ path: path.join(RAW, slug, 'error.png') }).catch(() => {});
    }
    await S.finish({ ok });
    if (!ok) continue;
  }
  const r = assemble({ rawDir: RAW, slug, outDir: OUT });
  console.log(`✔ ${slug}.mp4 ${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')} · ${r.cues} captions (${r.synced} frame-synced) · ${r.chapters.length} chapters`);
  if (r.issues?.length) console.log('  issues:', r.issues);
}
process.exit(failed ? 1 : 0);
