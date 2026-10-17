// Studio — records one tutorial video with Playwright.
//
// A scenario gets a `S` object: it drives the real app in Chrome, draws on-screen captions, a visible cursor and
// title cards, and logs every caption with its time so `assemble.mjs` can write matching .srt/.vtt subtitle files.
// Nothing is faked: every record, stage move and approval goes through the UI and the real API.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const APP = process.env.APP_URL || 'http://localhost:5173';
export const API = process.env.API_URL || 'http://localhost:3001/api';
export const PW = process.env.SEED_STAFF_PASSWORD || 'GenesisDemo#2026';

export const PEOPLE = {
  GCADMIN: ['Kevin Lam', 'CRM Administrator'],
  GCCOO: ['Anjali Gopee', 'Chief Operating Officer'],
  GCBDH: ['Shalini Ramtohul', 'Head of BD & Strategic Partnerships'],
  GCRM1: ['Priya Ramdin', 'Relationship Manager'],
  GCRM2: ['Natasha Appadoo', 'Senior Relationship Manager'],
  GCRM3: ['Bruno Chan', 'Relationship Manager (Corporate)'],
  GCLMGR: ['Rajiv Doorgakant', 'Manager, Loans & Fixed Income'],
  GCLOAN1: ['Sophie Lagesse', 'Loans Executive'],
  GCLOAN2: ['Yash Bholah', 'Loans Executive'],
  GCCRED1: ['Nadia Peerbux', 'Credit Analyst'],
  GCCC1: ['Jean-Marc Desvaux', 'Credit Committee Member'],
  GCOPS1: ['Ritesh Seewoo', 'Operations Checker'],
  GCPM1: ['Laurent Koenig', 'Portfolio Manager'],
  GCPM2: ['Vanessa Ah-Kee', 'Fund Manager'],
  GCTRD1: ['Arvind Ramsurrun', 'Trader'],
  GCADV1: ['Camille Rivalland', 'Corporate Advisor'],
  GCADV2: ['Ryan Pillay', 'Advisory Analyst'],
  GCFX1: ['Deepak Mungur', 'Forex Dealer'],
  GCMKT1: ['Emilie Fanchette', 'Marketing Executive'],
  GCCOMP1: ['Fatima Hossenbux', 'Compliance Officer'],
  GCMLRO: ['Olivier Maurel', 'MLRO'],
  GCAUD1: ['Karim Joomun', 'Internal Auditor'],
};

// ── API helpers (lookups and assertions only — every user-visible action goes through the UI) ─────────────────────
const tokens = {};
export async function token(id) {
  if (tokens[id]) return tokens[id];
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employee_id: id, password: PW }) });
  const j = await r.json();
  const d = j.data ?? j;
  tokens[id] = d.token ?? d.access_token;
  if (!tokens[id]) throw new Error(`login failed for ${id}: ${JSON.stringify(j).slice(0, 200)}`);
  return tokens[id];
}
export async function api(id, method, p, body) {
  const r = await fetch(API + p, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${await token(id)}` },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000),
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt; }
  return { status: r.status, body: j, data: j?.data ?? j };
}
export async function records(id, objectId, { limit = 200, ...q } = {}) {
  const qs = new URLSearchParams({ object_id: String(objectId), limit: String(limit), ...q });
  const r = await api(id, 'GET', `/runtime/records?${qs}`);
  return r.data ?? [];
}
export async function poll(fn, { timeout = 120000, every = 1500, what = 'condition' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((res) => setTimeout(res, every));
  }
}

// Object metadata (field types and labels) so fill() can pick the right control.
let META;
export async function meta() {
  if (META) return META;
  const r = await api('GCADMIN', 'GET', '/runtime/bootstrap');
  const d = r.data;
  META = { byName: {}, byId: {}, modules: d.modules };
  for (const o of Object.values(d.objects)) {
    const fields = {};
    for (const f of o.fields || []) fields[f.name] = { type: f.field_type, label: f.label, config: f.config || {}, options: f.options || [] };
    const entry = { id: o.id, module_id: o.module_id, name: o.name, label: o.label, plural: o.plural_label, fields, forms: o.forms || [] };
    META.byName[o.name] = entry; META.byId[o.id] = entry;
  }
  return META;
}
export async function obj(name) {
  const m = await meta();
  const o = m.byName[name];
  if (!o) throw new Error(`unknown object ${name}`);
  return o;
}

// ── In-page overlay: captions, step chip, title cards, cursor ─────────────────────────────────────────────────────
function overlayScript() {
  // Only the top page gets captions and the cursor — not PDF previews or other iframes.
  if (window.top !== window.self) return;
  const css = `
  #__st_cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483646;max-width:1180px;min-width:420px;
    background:rgba(15,23,42,.93);color:#fff;font:600 21px/1.38 Inter,system-ui,-apple-system,sans-serif;padding:13px 24px 14px;
    border-radius:14px;box-shadow:0 10px 34px rgba(0,0,0,.35);text-align:center;pointer-events:none;letter-spacing:.1px}
  #__st_cap .sub{font-weight:400;font-size:16px;opacity:.86;margin-top:5px}
  #__st_cap .eb{font:700 12px/1 Inter,system-ui,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#fbbf24;margin-bottom:7px}
  #__st_card{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(1200px 700px at 30% 20%,#1e3a8a 0%,#0f172a 60%,#020617 100%);color:#fff;font-family:Inter,system-ui,sans-serif}
  #__st_card .in{max-width:1040px;padding:0 60px}
  #__st_card .eyebrow{font:700 15px/1 Inter,system-ui;letter-spacing:3px;text-transform:uppercase;color:#93c5fd;margin-bottom:18px}
  #__st_card h1{font:800 54px/1.1 Inter,system-ui;margin:0 0 16px}
  #__st_card p{font:400 22px/1.5 Inter,system-ui;color:#cbd5e1;margin:0 0 22px}
  #__st_card ul{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:10px 34px}
  #__st_card li{font:500 18px/1.4 Inter,system-ui;color:#e2e8f0;padding-left:26px;position:relative}
  #__st_card li:before{content:'';position:absolute;left:0;top:8px;width:10px;height:10px;border-radius:3px;background:#fbbf24}
  #__st_card .foot{margin-top:30px;font:500 15px/1.4 Inter,system-ui;color:#94a3b8}
  #__st_cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;
    transition:transform .05s linear}
  #__st_ring{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #f59e0b;
    z-index:2147483646;pointer-events:none;opacity:0;transform:scale(.4)}
  #__st_ring.go{animation:__st_ring .45s ease-out}
  @keyframes __st_ring{0%{opacity:.95;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}
  .__st_hl{outline:3px solid #f59e0b !important;outline-offset:3px !important;border-radius:8px;transition:outline-color .2s}
  `;
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const ensure = () => {
    if (!document.body) return;
    if (!document.getElementById('__st_css')) {
      const st = document.createElement('style'); st.id = '__st_css'; st.textContent = css; document.head.appendChild(st);
    }
    const get = (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
    const cap = get('__st_cap'), sub = get('__st_sub'), chip = get('__st_chip'), card = get('__st_card');
    let el = document.getElementById('__st_cap');
    if (cap) {
      if (!el) { el = document.createElement('div'); el.id = '__st_cap'; document.body.appendChild(el); }
      const [a, b] = chip ? chip.split('|') : [];
      const html = (chip ? `<div class="eb">${esc(a)}${b ? ` · ${esc(b)}` : ''}</div>` : '') + esc(cap) + (sub ? `<div class="sub">${esc(sub)}</div>` : '');
      if (el.innerHTML !== html) el.innerHTML = html;
    } else el?.remove();
    let cd = document.getElementById('__st_card');
    if (card) {
      const c = JSON.parse(card);
      if (!cd) { cd = document.createElement('div'); cd.id = '__st_card'; document.body.appendChild(cd); }
      const html = `<div class="in"><div class="eyebrow">${esc(c.eyebrow)}</div><h1>${esc(c.title)}</h1>` +
        (c.text ? `<p>${esc(c.text)}</p>` : '') +
        (c.bullets?.length ? `<ul>${c.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '') +
        (c.foot ? `<div class="foot">${esc(c.foot)}</div>` : '') + '</div>';
      if (cd.innerHTML !== html) cd.innerHTML = html;
    } else cd?.remove();
    // Sync code: the current caption's number as 10 tiny black/white cells in the
    // bottom-left corner. assemble.mjs reads it back to time the subtitle files.
    let code = document.getElementById('__st_code');
    if (!code) {
      code = document.createElement('div'); code.id = '__st_code';
      code.style.cssText = 'position:fixed;left:0;bottom:0;width:80px;height:6px;display:flex;z-index:2147483647;pointer-events:none';
      for (let i = 0; i < 10; i++) { const c = document.createElement('i'); c.style.cssText = 'display:block;width:8px;height:6px'; code.appendChild(c); }
      document.body.appendChild(code);
    }
    const n = Number(get('__st_n')) || 0;
    if (code.dataset.n !== String(n)) {
      code.dataset.n = String(n);
      [...code.children].forEach((c, i) => { c.style.background = (n >> i) & 1 ? '#fff' : '#000'; });
    }
    if (!document.getElementById('__st_cursor')) {
      const cur = document.createElement('div'); cur.id = '__st_cursor';
      cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.body.appendChild(cur);
      const ring = document.createElement('div'); ring.id = '__st_ring'; document.body.appendChild(ring);
      const pos = (() => { try { return JSON.parse(sessionStorage.getItem('__st_pos') || 'null'); } catch { return null; } })();
      if (pos) cur.style.transform = `translate(${pos[0]}px,${pos[1]}px)`;
    }
  };
  addEventListener('mousemove', (e) => {
    const cur = document.getElementById('__st_cursor');
    if (cur) cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    try { sessionStorage.setItem('__st_pos', JSON.stringify([e.clientX, e.clientY])); } catch { /* ignore */ }
  }, true);
  addEventListener('mousedown', (e) => {
    const ring = document.getElementById('__st_ring'); if (!ring) return;
    ring.style.left = `${e.clientX}px`; ring.style.top = `${e.clientY}px`;
    ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
  }, true);
  setInterval(ensure, 120);
  document.addEventListener('DOMContentLoaded', ensure);
}

// ── Session ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function session({ slug, title, rawDir }) {
  const out = path.join(rawDir, slug);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars', '--disable-features=Translate', '--window-size=1440,900'] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'Indian/Mauritius',
    recordVideo: { dir: out, size: { width: 1440, height: 900 } },
  });
  await ctx.addInitScript(overlayScript);
  const t0 = Date.now();
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  // Chrome sizes the first document's screencast before the viewport is applied
  // (the bottom ~90 px came out grey); apply it and start from a blank page.
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('about:blank');
  const now = () => (Date.now() - t0) / 1000;
  const cues = [], chapters = [], cuts = [], issues = [];
  let open = null;
  let cueNo = 0;
  const log = (...a) => console.log(`[${slug} ${now().toFixed(1)}s]`, ...a);

  async function store(kv) {
    await p.evaluate((o) => { for (const [k, v] of Object.entries(o)) { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } }, kv).catch(() => {});
  }
  function closeCue() { if (open) { open.end = now(); cues.push(open); open = null; } }

  const S = {
    p, log, now, issues, slug, title,

    /** Show a caption (and log it as a subtitle cue). `sub` is a smaller second line. */
    async say(text, sub = '', hold = 0) {
      closeCue();
      open = { start: now(), text, sub, n: ++cueNo };
      await store({ __st_cap: text, __st_sub: sub, __st_n: String(open.n) });
      if (hold) await p.waitForTimeout(hold);
    },
    async clear() { closeCue(); await store({ __st_cap: '', __st_sub: '', __st_n: '' }); },

    /** Start a numbered chapter: top-right chip plus a caption. */
    async step(n, name, text, sub = '', hold = 0) {
      chapters.push({ t: now(), n, name, cue: cueNo + 1 });
      await store({ __st_chip: `Step ${n}|${name}` });
      log('STEP', n, name);
      await S.say(text, sub, hold);
    },

    /** Full-screen title card (also captioned). */
    async card({ eyebrow, title: t, text, bullets, foot }, ms = 6000) {
      closeCue();
      open = { start: now(), text: t, sub: text || '', n: ++cueNo };
      await store({ __st_card: JSON.stringify({ eyebrow, title: t, text, bullets, foot }), __st_cap: '', __st_sub: '', __st_chip: '', __st_n: String(open.n) });
      await p.waitForTimeout(ms);
      await store({ __st_card: '', __st_n: '' });
      closeCue();
    },

    /** Mark the next stretch as a wait to trim out of the video. */
    async waitCut(fn) { const s = now(); const r = await fn(); const e = now(); if (e - s > 2.5) cuts.push([s + 0.8, e - 0.3]); return r; },

    async settle(extra = 900) {
      const s = now();
      await p.waitForLoadState('domcontentloaded').catch(() => {});
      await p.waitForFunction(() => {
        const t = document.body?.innerText || '';
        // The app shell (main) must be up — the full-page boot spinner sits outside it.
        return !!document.querySelector('main, form, [data-public]') && !/Loading\.\.\.|Loading…|Searching…/.test(t)
          && !document.querySelector('main .animate-spin, [role=dialog] .animate-spin');
      }, null, { timeout: 60000, polling: 200 }).catch(() => log('settle timeout'));
      const e = now(); if (e - s > 2.5) cuts.push([s + 0.8, e - 0.3]);
      await p.waitForTimeout(extra);
    },

    async go(url, extra = 900) {
      await p.goto(url.startsWith('http') ? url : APP + url, { waitUntil: 'domcontentloaded' });
      await S.settle(extra);
    },

    // Smooth, visible mouse movement to an element, then click.
    async moveTo(loc, { click = true, dx = 0.5, dy = 0.5 } = {}) {
      const el = typeof loc === 'string' ? p.locator(loc).first() : loc;
      await el.waitFor({ state: 'visible', timeout: 30000 });
      // Keep the target in the middle band of the screen, clear of the caption box.
      const b0 = await el.boundingBox();
      if (b0 && (b0.y < 70 || b0.y + b0.height > 900 - 150)) {
        await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
        await p.waitForTimeout(250);
      }
      const b = await el.boundingBox();
      if (!b) throw new Error('element has no box');
      await p.mouse.move(b.x + b.width * dx, b.y + b.height * dy, { steps: 14 });
      await p.waitForTimeout(160);
      if (click) await el.click();
      return el;
    },
    click(loc, o) { return S.moveTo(loc, o); },
    async clickText(text, { role = 'button', exact = true, within } = {}) {
      const root = within || p;
      const el = role ? root.getByRole(role, { name: text, exact }).first() : root.getByText(text, { exact }).first();
      return S.moveTo(el);
    },
    async highlight(loc, ms = 2500) {
      const el = typeof loc === 'string' ? p.locator(loc).first() : loc;
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.evaluate((e) => e.classList.add('__st_hl')).catch(() => {});
      await p.waitForTimeout(ms);
      await el.evaluate((e) => e.classList.remove('__st_hl')).catch(() => {});
    },
    async scroll(dy = 400, ms = 1600) { await p.mouse.wheel(0, dy); await p.waitForTimeout(ms); },
    async type(text, delay = 38) { await p.keyboard.type(String(text), { delay }); },

    // ── Auth ──
    async logout() {
      const btn = p.locator('button[aria-label="Sign out"]');
      if (await btn.count()) { await S.moveTo(btn.first()); await p.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {}); }
    },
    async login(id, why = '') {
      const [name, role] = PEOPLE[id] || [id, ''];
      if (!p.url().includes('/login')) {
        if (p.url().startsWith(APP) && !p.url().includes('/f/') && !p.url().includes('/upload/')) await S.logout();
        if (!p.url().includes('/login')) await p.goto(`${APP}/login`);
      }
      await p.waitForSelector('input[name=employee_id]', { timeout: 60000 });
      await S.say(`Sign in as ${name} — ${role}`, why || `Employee ID ${id}`);
      await p.waitForTimeout(500);
      await S.moveTo('input[name=employee_id]'); await S.type(id, 60);
      await S.moveTo('input[name=password]'); await S.type(PW, 18);
      await p.waitForTimeout(300);
      await S.moveTo('button[type=submit]');
      await S.waitCut(() => p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }));
      await S.settle(700);
      S.who = id;
    },

    // ── Module navigation ──
    async openObject(name, { view } = {}) {
      const o = await obj(name);
      await S.go(`/module/${o.module_id}/object/${o.id}`);
      if (view) await S.view(view);
      return o;
    },
    async view(v) {
      const btn = p.locator(`button[title="${v}"]`).first();
      // The view toggle appears once the object's metadata has loaded.
      if (await btn.waitFor({ timeout: 20000 }).then(() => true).catch(() => false)) { await S.moveTo(btn); await S.settle(800); }
      if (v === 'Pipeline') await p.locator('div.min-w-\\[260px\\]').first().waitFor({ timeout: 30000 }).catch(() => {});
    },
    async openRecord(name, id) {
      const o = await obj(name);
      await S.go(`/module/${o.module_id}/object/${o.id}?record=${id}`, 1200);
    },
    async tab(label) {
      const t = p.getByRole('button', { name: label, exact: true }).last();
      await S.moveTo(t); await S.settle(900);
    },

    // ── Pipeline board ──
    column(label) {
      return p.locator('div.min-w-\\[260px\\]').filter({ has: p.locator(`span:text-is("${label}")`) }).first();
    },
    /** Drag a card between columns. Returns the PATCH response. With expectFail, a refused move is expected. */
    async drag(cardText, from, to, { expectFail = false, after = 1800 } = {}) {
      const src = S.column(from), dst = S.column(to);
      await src.waitFor({ timeout: 30000 });
      // Scroll the board so the leftmost of the two columns is at the left edge —
      // both stay visible whether the move goes forward or backward.
      const sl = (await src.boundingBox()).x, dl = (await dst.boundingBox()).x;
      await (dl < sl ? dst : src).evaluate((col) => { const c = col.parentElement; c.scrollBy({ left: col.getBoundingClientRect().left - c.getBoundingClientRect().left - 8, behavior: 'smooth' }); });
      await p.waitForTimeout(700);
      const card = src.getByText(cardText).first();
      await card.waitFor({ timeout: 30000 });
      await card.scrollIntoViewIfNeeded();
      const cb = await card.boundingBox(); const db = await dst.boundingBox();
      const sx = cb.x + Math.min(cb.width / 2, 120), sy = cb.y + cb.height / 2;
      await p.mouse.move(sx, sy, { steps: 12 }); await p.waitForTimeout(300);
      const resp = p.waitForResponse((r) => r.url().includes('/stage') && r.request().method() === 'PATCH', { timeout: 240000 });
      await p.mouse.down();
      await p.mouse.move(sx + 20, sy + 6, { steps: 5 });
      // A destination beyond the visible board: hold the card at the edge until
      // the board auto-scrolls it into view, then re-measure.
      let target = db;
      const vw = p.viewportSize().width;
      if (target.x + target.width / 2 > vw - 20 || target.x + target.width / 2 < 260) {
        const edge = target.x > sx ? vw - 12 : 250;
        await p.mouse.move(edge, sy, { steps: 20 });
        for (let i = 0; i < 40; i++) {
          await p.waitForTimeout(150);
          target = await dst.boundingBox();
          if (target && target.x > 240 && target.x + target.width < vw - 4) break;
        }
      }
      await p.mouse.move(target.x + target.width / 2, Math.min(target.y + 120, target.y + target.height - 20), { steps: 28 });
      await p.waitForTimeout(350);
      await p.mouse.up();
      const r = await S.waitCut(() => resp);
      const ok = r.status() < 300;
      log(`move ${from} -> ${to}:`, r.status());
      if (ok === expectFail) throw new Error(`Unexpected move result ${from}->${to} ${r.status()} ${(await r.text()).slice(0, 300)}`);
      await p.waitForTimeout(after);
      return r;
    },

    // ── Forms ──
    /** Fill fields on the open form. `values` maps field name → value (lookup: text to search and pick). */
    async fill(objectName, values, { delay = 32 } = {}) {
      const o = await obj(objectName);
      for (const [name, value] of Object.entries(values)) {
        const f = o.fields[name] || { type: 'text', label: name, config: {} };
        const disp = f.config?.choice_display;
        const el = p.locator(`[id="${name}"]`).first();
        if (f.type === 'lookup') {
          await S.moveTo(el);
          const input = p.locator(`input[id="${name}"]`).first();
          await input.waitFor({ timeout: 10000 });
          await input.fill(''); await S.type(value, 45);
          const opt = el.locator('xpath=ancestor::div[contains(@class,"relative")][1]').locator('ul button').filter({ hasText: value }).first();
          await opt.waitFor({ timeout: 30000 });
          await S.moveTo(opt);
        } else if ((f.type === 'select' || f.type === 'radio') && (disp === 'chips' || disp === 'segmented')) {
          const opt = f.options.find((x) => (x.value ?? x) === value || (x.label ?? x) === value);
          await S.moveTo(el.getByRole('button', { name: opt?.label ?? value, exact: true }));
        } else if (f.type === 'select' || (f.type === 'radio' && disp === 'dropdown')) {
          await S.moveTo(el, { click: false });
          const opts = await el.locator('option').evaluateAll((os) => os.map((x) => [x.value, x.textContent.trim()]));
          const hit = opts.find(([v, l]) => v === String(value) || l === String(value));
          if (!hit) throw new Error(`no option ${value} for ${name}: ${opts.map((x) => x[0]).join(',')}`);
          await el.selectOption(hit[0]);
        } else if (f.type === 'radio') {
          const opt = f.options.find((x) => (x.value ?? x) === value || (x.label ?? x) === value);
          const group = p.locator(`label:has-text("${f.label}")`).first().locator('xpath=..');
          await S.moveTo(group.getByLabel(opt?.label ?? value, { exact: true }).first());
        } else if (f.type === 'checkbox') {
          await S.moveTo(el, { click: false });
          if ((await el.isChecked()) !== !!value) await el.click();
        } else if (f.type === 'multi_select') {
          const vals = Array.isArray(value) ? value : [value];
          for (const v of vals) {
            const opt = f.options.find((x) => (x.value ?? x) === v || (x.label ?? x) === v);
            const lbl = opt?.label ?? v;
            const btn = p.locator(`label:has-text("${f.label}")`).first().locator('xpath=..').getByText(lbl, { exact: true }).first();
            await S.moveTo(btn);
          }
        } else if (['date', 'datetime', 'time'].includes(f.type)) {
          await S.moveTo(el, { click: false });
          await el.fill(String(value));
        } else {
          await S.moveTo(el);
          await p.keyboard.press('Meta+A'); await p.keyboard.press('Backspace');
          await S.type(value, delay);
        }
        await p.waitForTimeout(220);
      }
    },
    /** Click the form's submit button and wait for the save request. */
    async submit({ expectFail = false } = {}) {
      const btn = p.locator('form button[type=submit]').last();
      const resp = p.waitForResponse((r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 240000 });
      await S.moveTo(btn);
      // Either the save request goes out, or client-side validation shows errors.
      const invalid = p.locator('.form-error').first().waitFor({ state: 'visible', timeout: 240000 }).then(() => 'invalid').catch(() => null);
      const first = await Promise.race([resp.then(() => 'sent'), invalid]);
      if (first === 'invalid' && expectFail) { log('save refused by form validation (expected)'); await p.waitForTimeout(1200); return null; }
      if (first === 'invalid' && !expectFail) {
        const errs = await p.locator('.form-error').evaluateAll((es) => es.map((e) => {
          const box = e.closest('div.flex.flex-col, div');
          return `${box?.querySelector('label')?.textContent?.trim() || '?'}: ${e.textContent.trim()}`;
        }));
        throw new Error(`form validation: ${errs.join('; ')}`);
      }
      const r = await S.waitCut(() => resp);
      const body = await r.json().catch(() => ({}));
      log('save', r.status());
      if ((r.status() < 300) === expectFail) throw new Error(`save ${r.status()} ${JSON.stringify(body).slice(0, 400)}`);
      await S.settle(900);
      return body?.data ?? body;
    },
    /** Open the New form for an object from its list page. */
    async newRecord(name) {
      const o = await obj(name);
      await S.go(`/module/${o.module_id}/object/${o.id}/new`);
      return o;
    },
    async editRecord(name, id, formLabel) {
      const o = await obj(name);
      await S.go(`/module/${o.module_id}/object/${o.id}/edit/${id}`);
      if (formLabel) { await S.moveTo(p.getByRole('tab', { name: formLabel })); await S.settle(700); }
    },

    // ── Approvals ──
    async approve(match, comment, { action = 'approve' } = {}) {
      await S.go('/approvals', 1200);
      const card = p.locator('article').filter({ hasText: match }).filter({ has: p.getByRole('button', { name: 'Approve' }) }).first();
      await card.waitFor({ timeout: 30000 });
      await S.highlight(card, 1800);
      if (comment) { await S.moveTo(card.getByPlaceholder(/Comment/)); await S.type(comment, 22); }
      const resp = p.waitForResponse((r) => r.url().includes('/workflows/approval') && r.request().method() === 'POST', { timeout: 240000 });
      await S.moveTo(card.getByRole('button', { name: action === 'approve' ? 'Approve' : 'Reject' }));
      const r = await S.waitCut(() => resp);
      log(action, r.status());
      if (r.status() >= 300) throw new Error(`${action} failed ${r.status()} ${(await r.text()).slice(0, 300)}`);
      await S.settle(1500);
      const done = p.getByRole('button', { name: 'Done', exact: true });
      if (await done.count()) { await p.waitForTimeout(1200); await S.moveTo(done.first()); }
    },

    issue(text) { issues.push(text); log('ISSUE', text); },

    async finish({ ok = true } = {}) {
      closeCue();
      const elapsed = now();
      const video = p.video();
      await ctx.close(); await browser.close();
      const raw = path.join(out, 'raw.webm');
      if (video) fs.renameSync(await video.path(), raw);
      fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify({ slug, title, elapsed, cues, chapters, cuts, issues, ok }, null, 2));
      log('finished', elapsed.toFixed(1), 's');
      return { raw, elapsed };
    },
  };
  return S;
}
