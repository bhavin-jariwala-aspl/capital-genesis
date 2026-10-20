#!/usr/bin/env node
// Builds the documentation roadmap from docs/navigation.json:
//   - a "you are here" block under the title of every listed document
//   - a "where to next" block at the end of every listed document
//   - the table of contents of each section README   (<!-- nav:toc:<section id> -->)
//   - the journeys and the full catalogue in the hub   (docs/README.md: <!-- nav:journeys -->, <!-- nav:catalog -->)
// Generated text lives between <!-- nav:… --> markers; everything else is left alone, so the
// script can be re-run at any time. `--check` reports problems without writing.
//
//   node docs/tools/build-nav.mjs [--check]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const nav = JSON.parse(fs.readFileSync(path.join(DOCS, 'navigation.json'), 'utf8'));
const problems = [];
const HUB = 'README.md'; // docs/README.md — the roadmap

// ── helpers ──────────────────────────────────────────────────────────────────
const abs = (p) => path.join(DOCS, p.split('#')[0]);
const exists = (p) => fs.existsSync(abs(p));
const link = (from, to) => {
  const [file, anchor] = to.split('#');
  let rel = path.relative(path.dirname(from), file) || path.basename(file);
  return anchor ? `${rel}#${anchor}` : rel;
};
const slug = (s) => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/ /g, '-'); // GitHub keeps one hyphen per space

function block(text, name, body, where) {
  const open = `<!-- nav:${name} -->`, close = `<!-- /nav:${name} -->`;
  const re = new RegExp(`${open}[\\s\\S]*?${close}\\n?`);
  const content = `${open}\n${body}\n${close}\n`;
  if (re.test(text)) return text.replace(re, content);
  if (where === 'top') {
    const m = text.match(/^# .*\n/m);
    if (!m) { problems.push(`no H1 title to anchor the top block`); return content + '\n' + text; }
    const at = m.index + m[0].length;
    return `${text.slice(0, at)}\n${content}${text.slice(at).replace(/^\n+/, '\n')}`;
  }
  if (where === 'bottom') return `${text.replace(/\s*$/, '')}\n\n${content}`;
  problems.push(`marker ${open} missing`);
  return text;
}

// ── index the manifest ───────────────────────────────────────────────────────
const order = [];               // global reading order across sections
const info = new Map();         // path → { doc, section, i }
for (const s of nav.sections) {
  if (!exists(s.readme)) problems.push(`section ${s.id}: readme ${s.readme} not found`);
  s.docs.forEach((d, i) => {
    if (!exists(d.path)) problems.push(`${d.path} listed but not found`);
    if (info.has(d.path)) problems.push(`${d.path} listed twice`);
    info.set(d.path, { doc: d, section: s, i });
    order.push(d.path);
    for (const r of d.related ?? []) if (!exists(r)) problems.push(`${d.path}: related ${r} not found`);
    if (d.concept && !nav.concepts[d.concept]) problems.push(`${d.path}: unknown concept ${d.concept}`);
  });
}
for (const j of nav.journeys) for (const [p] of j.steps) if (!exists(p)) problems.push(`journey ${j.id}: ${p} not found`);

const sectionLink = (from, s) => link(from, s.anchor ? `${s.readme}#${s.anchor}` : s.readme);
const journeysOf = (p) => nav.journeys.flatMap((j) => j.steps
  .map(([sp], k) => (sp.split('#')[0] === p ? `[${j.title}](${link(p, `${HUB}#${slug(j.title)}`)}) (step ${k + 1} of ${j.steps.length})` : null))
  .filter(Boolean));

// ── per-document blocks ──────────────────────────────────────────────────────
const writes = new Map();
const read = (p) => writes.get(p) ?? (fs.existsSync(abs(p)) ? fs.readFileSync(abs(p), 'utf8') : '');

for (const p of order) {
  const { doc: d, section: s, i } = info.get(p);
  const g = order.indexOf(p);
  const prev = order[g - 1], next = order[g + 1];
  const t = (q) => info.get(q).doc.title;
  const crossing = (q) => (info.get(q).section !== s ? ` *(${info.get(q).section.title})*` : '');

  const top = [
    `> **[Docs roadmap](${link(p, HUB)})** › **[${s.title}](${sectionLink(p, s)})** › ${i + 1} of ${s.docs.length} · **For:** ${d.for}`,
  ];
  const nb = [prev && `← [${t(prev)}](${link(p, prev)})${crossing(prev)}`, next && `[${t(next)}](${link(p, next)})${crossing(next)} →`].filter(Boolean);
  if (nb.length) top.push(`> ${nb.join(' · ')}`);
  if (d.concept && s.id !== 'understanding') {
    const c = nav.concepts[d.concept];
    top.push(`> New to Genesis? Background: [Understanding Genesis › ${c.title}](${link(p, c.path)})`);
  }

  const rows = [];
  if (next) rows.push(`| **Next** | [${t(next)}](${link(p, next)})${crossing(next)} — ${info.get(next).doc.summary} |`);
  if (prev) rows.push(`| **Previous** | [${t(prev)}](${link(p, prev)})${crossing(prev)} |`);
  if (d.concept && s.id !== 'understanding') {
    const c = nav.concepts[d.concept];
    rows.push(`| **Background** | [Understanding Genesis › ${c.title}](${link(p, c.path)}) |`);
  }
  if (d.related?.length) rows.push(`| **Related** | ${d.related.map((r) => `[${info.get(r)?.doc.title ?? path.basename(r, '.md')}](${link(p, r)})`).join(' · ')} |`);
  const js = journeysOf(p);
  if (js.length) rows.push(`| **On these journeys** | ${js.join(' · ')} |`);
  rows.push(`| **Lost?** | [Docs roadmap](${link(p, HUB)}) · [${s.title}](${sectionLink(p, s)}) · [Understanding Genesis](${link(p, 'understanding/README.md')}) |`);
  const bottom = ['', '---', '', '### Where to next', '', '| | |', '|---|---|', ...rows].join('\n');

  let text = read(p);
  text = block(text, 'top', top.join('\n'), 'top');
  text = block(text, 'bottom', bottom, 'bottom');
  writes.set(p, text);
}

// ── section tables of contents ───────────────────────────────────────────────
for (const s of nav.sections) {
  if (s.toc === false || (s.docs.length === 1 && s.docs[0].path === s.readme)) continue; // own table, or the readme is the only document
  const p = s.readme;
  const rows = s.docs.map((d, i) => `| ${i + 1} | [${d.title}](${link(p, d.path)}) | ${d.for} | ${d.summary} |`);
  const body = [`| # | Document | For | What you'll learn |`, `|---|---|---|---|`, ...rows].join('\n');
  const text = read(p);
  if (!text.includes(`<!-- nav:toc:${s.id} -->`)) { problems.push(`${p}: add <!-- nav:toc:${s.id} --><!-- /nav:toc:${s.id} --> where the ${s.title} table belongs`); continue; }
  writes.set(p, block(text, `toc:${s.id}`, body));
}

// readme "you are here" lines for section READMEs that are not themselves listed docs
for (const readme of new Set(nav.sections.map((s) => s.readme))) {
  if (info.has(readme)) continue;
  const secs = nav.sections.filter((s) => s.readme === readme);
  const line = `> **[Docs roadmap](${link(readme, HUB)})** › ${secs.map((s) => `**${s.title}**`).join(' · ')} — ${secs.map((s) => s.for).join('; ')}`;
  writes.set(readme, block(read(readme), 'top', line, 'top'));
}

// ── the hub: journeys and catalogue ─────────────────────────────────────────
{
  const p = HUB;
  const jbody = nav.journeys.map((j) => [
    `### ${j.title}`, '', `*${j.who}* — about ${j.time}.`, '',
    ...j.steps.map(([sp, why], k) => `${k + 1}. [${info.get(sp.split('#')[0])?.doc.title ?? (sp.endsWith('README.md') || sp.includes('README.md#') ? nav.sections.find((s) => sp === s.readme || sp === `${s.readme}#${s.anchor}`)?.title ?? sp : sp)}](${link(p, sp)}) — ${why}`),
    '',
  ].join('\n')).join('\n');
  const cbody = nav.sections.map((s) => [
    `### ${s.title}`, '', `*${s.for}* · [section guide](${sectionLink(p, s)})`, '',
    '| Document | For | What you\'ll learn |', '|---|---|---|',
    ...s.docs.map((d) => `| [${d.title}](${link(p, d.path)}) | ${d.for} | ${d.summary} |`), '',
  ].join('\n')).join('\n');
  let text = read(p);
  text = block(text, 'journeys', jbody.trimEnd());
  text = block(text, 'catalog', cbody.trimEnd());
  writes.set(p, text);
}

// ── orphans: markdown files not on the roadmap ───────────────────────────────
const SKIP = new Set([HUB]);
const listed = new Set([...order, ...nav.sections.map((s) => s.readme)]);
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(DOCS, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['tools', 'scripts', 'node_modules'].includes(e.name) && !e.name.startsWith('.')) walk(rel); continue; }
    if (e.name.endsWith('.md') && !listed.has(rel) && !SKIP.has(rel)) problems.push(`${rel} is not on the roadmap (add it to navigation.json)`);
  }
})('');

// ── write / report ───────────────────────────────────────────────────────────
let changed = 0;
for (const [p, text] of writes) {
  if (!fs.existsSync(abs(p)) || fs.readFileSync(abs(p), 'utf8') === text) continue;
  changed++;
  if (!CHECK) fs.writeFileSync(abs(p), text);
}
for (const m of problems) console.log(`! ${m}`);
console.log(`${CHECK ? 'would update' : 'updated'} ${changed} file(s); ${order.length} documents on the roadmap; ${problems.length} problem(s)`);
process.exit(problems.length && CHECK ? 1 : 0);
