// End-to-end loan demo recorder: enquiry form -> qualify -> convert -> loan application -> credit approval.
// Writes out/raw.webm, out/marks.json (step start times) and out/cuts.json (long loading waits to trim).
import { chromium } from 'playwright';
import fs from 'node:fs';
import { PW } from './lib.mjs';
import { tok, api } from './api.mjs';

const APP = 'http://localhost:5173';
const FORM = `${APP}/f/2fe40fb6f0da0570cbe29eb9f465541b5c52897826acc486?prod=LND-RE`;
const ts = Date.now().toString().slice(-6);
const FIRST = 'Demo', LAST = 'Loan Applicant', NAME = `${FIRST} ${LAST}`;
const EMAIL = `demo.loan.applicant.${ts}@example.com`;
const OUT = 'out';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);

const marks = [], cuts = [];
let t0;
const now = () => (Date.now() - t0) / 1000;
const log = (...a) => console.log(`[${now().toFixed(1)}s]`, ...a);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } });
await ctx.addInitScript(() => {
  const draw = () => {
    const txt = sessionStorage.getItem('__cap') || '';
    const sub = sessionStorage.getItem('__sub') || '';
    let el = document.getElementById('__demo_cap');
    if (!txt) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = '__demo_cap';
      el.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:1100px;' +
        'background:rgba(17,24,39,.92);color:#fff;font:600 20px/1.35 Inter,system-ui,sans-serif;padding:12px 22px;border-radius:12px;' +
        'box-shadow:0 8px 30px rgba(0,0,0,.35);text-align:center;pointer-events:none';
      (document.body || document.documentElement).appendChild(el);
    }
    const html = txt + (sub ? `<div style="font-weight:400;font-size:15px;opacity:.85;margin-top:4px">${sub}</div>` : '');
    if (el.innerHTML !== html) el.innerHTML = html;
  };
  setInterval(draw, 200);
});
t0 = Date.now();
const p = await ctx.newPage();

async function caption(title, sub = '') {
  await p.evaluate(([a, b]) => { sessionStorage.setItem('__cap', a); sessionStorage.setItem('__sub', b); }, [title, sub]).catch(() => {});
}
async function step(title, sub = '') { marks.push({ t: now(), title, sub }); log('STEP', title); await caption(title, sub); }
async function note(title, sub = '') { await caption(title, sub); }

async function settle(extra = 1200) {
  const s = now();
  await p.waitForFunction(() => !/Loading\.\.\.|Loading…/.test(document.body.innerText) && !document.querySelector('main .animate-spin, .animate-spin'), null, { timeout: 180000, polling: 250 }).catch(() => log('settle timeout'));
  const e = now();
  if (e - s > 3) cuts.push([s + 1.0, e - 0.3]);
  await p.waitForTimeout(extra);
}
async function waitCut(fn) { const s = now(); const r = await fn(); const e = now(); if (e - s > 3) cuts.push([s + 1.0, e - 0.3]); return r; }

async function slowType(sel, text, delay = 45) { await p.click(sel); await p.keyboard.type(text, { delay }); }

async function logout() {
  const btn = p.locator('button[aria-label="Sign out"]');
  if (await btn.count()) { await btn.first().click(); await p.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}); }
}
async function login(id, who) {
  if (!p.url().includes('/login')) { await logout(); if (!p.url().includes('/login')) await p.goto(`${APP}/login`); }
  await p.waitForSelector('input[name=employee_id]', { timeout: 60000 });
  await note(`Sign in as ${id}`, who);
  await p.waitForTimeout(600);
  await slowType('input[name=employee_id]', id, 70);
  await p.click('input[name=password]'); await p.keyboard.type(PW, { delay: 25 });
  await p.waitForTimeout(400);
  await p.click('button[type=submit]');
  await waitCut(() => p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }));
  await settle(800);
}

async function boardView() {
  await p.click('button[title=Pipeline]');
  await p.waitForTimeout(1500);
  await settle(1200);
}
function columnOf(label) {
  return p.locator('div.min-w-\\[260px\\]').filter({ has: p.locator(`span:text-is("${label}")`) }).first();
}
async function dragCard(cardText, fromLabel, toLabel, { expectFail = false } = {}) {
  const src = columnOf(fromLabel), dst = columnOf(toLabel);
  await src.evaluate((col) => { const c = col.parentElement; c.scrollBy({ left: col.getBoundingClientRect().left - c.getBoundingClientRect().left - 8, behavior: 'smooth' }); });
  await p.waitForTimeout(900);
  const card = src.getByText(cardText).first();
  await card.waitFor({ timeout: 60000 });
  const cb = await card.boundingBox(); const db = await dst.boundingBox();
  const sx = cb.x + cb.width / 2, sy = cb.y + cb.height / 2;
  await p.mouse.move(sx - 60, sy - 40); await p.waitForTimeout(200);
  await p.mouse.move(sx, sy, { steps: 8 }); await p.waitForTimeout(350);
  const resp = p.waitForResponse((r) => r.url().includes('/stage') && r.request().method() === 'PATCH', { timeout: 120000 });
  await p.mouse.down();
  await p.mouse.move(sx + 20, sy + 5, { steps: 5 });
  await p.mouse.move(db.x + db.width / 2, db.y + 110, { steps: 30 });
  await p.waitForTimeout(400);
  await p.mouse.up();
  const r = await waitCut(() => resp);
  const ok = r.status() < 300;
  log(`move ${fromLabel} -> ${toLabel}:`, r.status());
  if (ok === expectFail) throw new Error(`Unexpected move result ${r.status()} ${await r.text()}`);
  await p.waitForTimeout(2200);
  return r;
}
async function fillField(label, value) {
  const box = p.locator('div.flex.flex-col.gap-1').filter({ has: p.locator('label').filter({ hasText: new RegExp(`^\\s*${label.replace(/[()/]/g, '\\$&')}\\s*\\*?\\s*$`, 'i') }) }).first();
  const input = (await box.count()) ? box.locator('input, select').first() : p.getByLabel(label, { exact: false }).first();
  await input.scrollIntoViewIfNeeded();
  if ((await input.evaluate((e) => e.tagName)) === 'SELECT') { await input.selectOption({ label: value }); await p.waitForTimeout(500); return; }
  await input.click(); await p.keyboard.press('Meta+A'); await p.keyboard.press('Backspace');
  await p.keyboard.type(value, { delay: 60 }); await p.waitForTimeout(400);
}
async function poll(fn, ms = 300000, every = 4000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('poll timeout'); await new Promise((r) => setTimeout(r, every)); }
}

let loanNo, finalEnq, loanId;
async function finalStep() {
  await step('Step 14 — Loan approved', 'Credit decision = Approved · stage moved to Offer issued · offer letter generated');
  await p.goto(`${APP}/module/89/object/170?record=${loanId}`);
  await settle(2500);
  await p.waitForTimeout(3000);
  const appr = p.getByText('Credit appraisal', { exact: true }).first();
  await appr.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(5000);
  await p.mouse.wheel(0, 2000); await p.waitForTimeout(1500);
  const docs = p.getByRole('button', { name: 'Docs' }).first();
  if (await docs.count()) { await docs.click(); await settle(1500); await p.waitForTimeout(4000); }
  await note('Done — from website enquiry to an approved loan', `${finalEnq} → ${loanNo} · approved by GCLMGR`);
  await p.waitForTimeout(5000);

}
try {
  let enqNo, enq, EXEC, EXEC_NAME, tLoan, loan;
  const R = process.env.RESUME_LOAN;
  if (process.env.FINAL_ONLY) {
    loan = (await api(await tok('GCLMGR'), 'GET', '/runtime/records/' + process.env.FINAL_ONLY)).body.data;
    enqNo = process.env.RESUME_ENQ_NO; loanId = loan.id; loanNo = loan.data?.application_no; finalEnq = enqNo;
    await p.goto(`${APP}/login`);
    await login('GCLMGR', 'Rajiv Doorgakant · Loans Manager');
    await step('Step 13 (cont.) — The approval was recorded', 'The decision took longer than the app’s 60 s timeout on the remote database, but it went through');
    await p.goto(`${APP}/approvals`); await settle(1500);
    const mine = p.getByRole('button', { name: 'My decisions' });
    if (await mine.count()) { await mine.click(); await settle(1500); await p.waitForTimeout(4000); }
    throw { final: true };
  }
  if (R) {
    EXEC = process.env.RESUME_EXEC; EXEC_NAME = { GCLOAN1: 'Sophie Lagesse', GCLOAN2: 'Yash Bholah' }[EXEC];
    tLoan = await tok(EXEC);
    enq = { id: Number(process.env.RESUME_ENQ) }; enqNo = process.env.RESUME_ENQ_NO;
    loan = (await api(tLoan, 'GET', '/runtime/records/' + R)).body.data;
    await p.goto(`${APP}/login`);
    await login(EXEC, `${EXEC_NAME} · Loans Executive`);
    await step('Step 7 (cont.) — The save completed on the server', 'The app’s save request took longer than its 60 s timeout on the remote database, but the data was stored');
  } else {
    // ── 1. Public enquiry form ───────────────────────────────────────────────
    await p.goto(FORM);
    await waitCut(() => p.waitForSelector('#estimated_amount', { timeout: 120000 }));
    await step('Step 1 — A client fills in the website loan enquiry form', 'Public web form, no sign-in · Real Estate Loan pre-selected');
    await p.waitForTimeout(2500);
    await slowType('#estimated_amount', '3000000', 90);
    await p.selectOption('#f-currency_code', 'MUR'); await p.waitForTimeout(600);
    await slowType('#requested_tenure_months', '240', 120);
    await p.waitForTimeout(1200);
    await p.click('text=Continue');
    await p.waitForTimeout(1500);
    await note('Step 1 — Client enters contact details', `${NAME} · ${EMAIL}`);
    await slowType('#first_name', FIRST);
    await slowType('#last_name', LAST);
    await slowType('#email', EMAIL, 30);
    await p.check('input[name=preferred_language][value=en]').catch(() => p.getByLabel('English').check());
    await p.check('input[name=consent_marketing]');
    await p.waitForTimeout(1200);
    await p.click('button[type=submit]');
    await waitCut(() => p.waitForFunction(() => /ENQ-\d{4}-\d+/.test(document.body.innerText), null, { timeout: 120000 }));
    enqNo = (await p.innerText('body')).match(/ENQ-\d{4}-\d+/)[0];
    await step('Step 2 — Enquiry received', `Reference ${enqNo} · routed to Lending and acknowledged by email`);
    await p.waitForTimeout(4500);

    // Look up the record ids (server side) so later steps can open them directly.
    const tAdm = await tok('GCADMIN');
    enq = await waitCut(() => poll(async () => {
      const r = await api(tAdm, 'GET', '/runtime/records?object_id=163&limit=50');
      return (r.body.data ?? []).find((x) => x.data?.email === EMAIL && x.assigned_to);
    }));
    EXEC = enq.assigned_to;
    EXEC_NAME = { GCLOAN1: 'Sophie Lagesse', GCLOAN2: 'Yash Bholah' }[EXEC] ?? EXEC;
    log('enquiry id', enq.id, 'assigned', EXEC);
    tLoan = await tok(EXEC);

    // ── 2. Loans executive works the enquiry ─────────────────────────────────
    await login(EXEC, `${EXEC_NAME} · Loans Executive (lending enquiries are shared round-robin between GCLOAN1 and GCLOAN2)`);
    await step('Step 3 — Loans executive opens the Enquiries list', `The new website enquiry is at the top, assigned to ${EXEC}`);
    await p.goto(`${APP}/module/87/object/163`);
    await settle(1500);
    const row = p.getByText(EMAIL).first();
    await row.scrollIntoViewIfNeeded();
    await row.evaluate((e) => { const tr = e.closest('tr') || e.parentElement; tr.style.outline = '3px solid #f59e0b'; tr.style.outlineOffset = '-3px'; });
    await p.waitForTimeout(3500);
    await note('Step 3 — Enquiry details', 'Product, amount, tenure, lead score/grade and indicative rate captured automatically');
    await p.goto(`${APP}/module/87/object/163?record=${enq.id}`);
    await settle(1500);
    await p.mouse.wheel(0, 350); await p.waitForTimeout(3500);
    await p.mouse.wheel(0, 350); await p.waitForTimeout(3000);

    await step('Step 4 — Qualify the enquiry: New → Contacted → Qualified', 'Drag the card on the Enquiry pipeline after calling the client');
    await p.goto(`${APP}/module/87/object/163`);
    await settle(800);
    await boardView();
    await dragCard(NAME, 'New', 'Contacted');
    await dragCard(NAME, 'Contacted', 'Qualified');
    await step('Step 5 — Convert the enquiry: Qualified → Converted', 'Creates the client (party), relationship, KYC case, consent record and the loan application');
    await dragCard(NAME, 'Qualified', 'Converted');
    await p.waitForTimeout(2500);

    loan = await waitCut(() => poll(async () => {
      const r = await api(tLoan, 'GET', '/runtime/records?object_id=170&limit=50');
      return (r.body.data ?? []).find((x) => Number(x.data?.enquiry) === enq.id);
    }));
    log('loan id', loan.id, loan.data?.application_no);

    // ── 3. Loan application ──────────────────────────────────────────────────
    await step('Step 6 — The loan application was created automatically', `${loan.data?.application_no} · Retail Lending pipeline · stage Pre-qualified`);
    await p.goto(`${APP}/module/89/object/170`);
    await settle(800);
    await boardView();
    await p.waitForTimeout(2500);
    await p.goto(`${APP}/module/89/object/170?record=${loan.id}`);
    await settle(1500);
    await p.waitForTimeout(2500);

    await step('Step 7 — Capture the application', 'Employment, net monthly income, existing repayments, property value, MCIB consent');
    await p.goto(`${APP}/module/89/object/170/edit/${loan.id}`);
    await settle(1500);
    await fillField('Employment', 'Salaried');
    await fillField('Net monthly income (MUR)', '150000');
    await fillField('Existing monthly repayments (MUR)', '0');
    await fillField('Property / project value (MUR)', '5000000');
    const mcib = p.getByLabel('Consent to MCIB credit bureau check');
    await mcib.scrollIntoViewIfNeeded(); if (!(await mcib.isChecked())) await mcib.check();
    await p.waitForTimeout(1500);
    const save = p.waitForResponse((r) => r.url().includes(`/runtime/records/${loan.id}`) && r.request().method() === 'PUT', { timeout: 120000 });
    await p.getByRole('button', { name: 'Save Changes' }).click();
    const sr = await waitCut(() => save);
    log('save', sr.status());
    if (sr.status() >= 300) throw new Error('save failed ' + (await sr.text()));
  }
  await p.waitForTimeout(1500);
  await p.goto(`${APP}/module/89/object/170?record=${loan.id}`);
  await settle(1500);
  await note('Step 7 — Pricing & eligibility are calculated', 'Rate from PLR + margin, EMI, LTV, DSR, eligibility and approval authority');
  const pricing = p.getByText('Pricing & eligibility (calculated)').first();
  await pricing.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(5000);

  await step('Step 8 — Move through the document stages', 'Pre-qualified → Application captured → Documents pending → Documents complete');
  await p.goto(`${APP}/module/89/object/170`);
  await settle(800);
  await boardView();
  await dragCard(NAME, 'Pre-qualified', 'Application captured');
  await dragCard(NAME, 'Application captured', 'Documents pending');
  await dragCard(NAME, 'Documents pending', 'Documents complete');

  // ── 4. Credit analyst ────────────────────────────────────────────────────
  await login('GCCRED1', 'Nadia Peerbux · Credit Analyst');
  await step('Step 9 — Credit analyst takes the application into Credit appraisal', 'Documents complete → Credit appraisal (entry rule: application must be eligible)');
  await p.goto(`${APP}/module/89/object/170`);
  await settle(800);
  await boardView();
  await dragCard(NAME, 'Documents complete', 'Credit appraisal');

  await step('Step 10 — Send to Credit approval (blocked)', 'The stage requires Risk grade and Analyst recommendation');
  const bad = await dragCard(NAME, 'Credit appraisal', 'Credit approval', { expectFail: true });
  log('blocked:', (await bad.text()).slice(0, 200));
  await p.waitForTimeout(4500);
  await note('App gap: Risk grade & Analyst recommendation are not editable in the UI',
    'They sit on the "Credit appraisal workbench" form, but Edit always opens the first form. For this demo they are set via the API: grade B, recommend Approve.');
  const tCred = await tok('GCCRED1');
  const pr = await api(tCred, 'PUT', `/runtime/records/${loan.id}`, { data: { risk_grade: 'B', analyst_recommendation: 'approve' } });
  log('api appraisal', pr.status);
  if (pr.status >= 300) throw new Error('appraisal PUT failed');
  await p.waitForTimeout(7000);
  await p.reload();
  await settle(800);
  await boardView();
  await step('Step 11 — Send to Credit approval', 'MUR 3m ≤ MUR 5m, so the approval matrix routes it to the Loans Manager (four eyes)');
  await dragCard(NAME, 'Credit appraisal', 'Credit approval');
  await p.waitForTimeout(2000);

  // ── 5. Loans manager approves ────────────────────────────────────────────
  const tMgr = await tok('GCLMGR');
  await waitCut(() => poll(async () => {
    const r = await api(tMgr, 'GET', '/runtime/workflows/approvals?scope=mine');
    return (r.body.data ?? []).find((i) => i.status === 'pending' && i.title?.includes(NAME) && String(i.message).includes(loan.data?.application_no));
  }, 180000));
  await login('GCLMGR', 'Rajiv Doorgakant · Loans Manager');
  await step('Step 12 — Loans Manager opens the Approvals inbox', `"Credit approval: ${NAME} · LND-RE" is waiting for the Loans Manager`);
  await p.goto(`${APP}/approvals`);
  await settle(1500);
  const item = p.locator('div').filter({ hasText: `Credit approval: ${NAME}` }).filter({ has: p.getByRole('button', { name: 'Approve' }) }).last();
  await item.scrollIntoViewIfNeeded();
  await item.evaluate((e) => { e.style.outline = '3px solid #f59e0b'; e.style.outlineOffset = '2px'; });
  await p.waitForTimeout(4000);
  await step('Step 13 — Approve with a comment', 'The maker (credit analyst) can never approve their own request');
  const comment = item.getByPlaceholder(/comment/i).first();
  if (await comment.count()) { await comment.click(); await p.keyboard.type('Approved: DSR 14.5%, LTV 60%, grade B. Demo approval.', { delay: 35 }); }
  await p.waitForTimeout(1200);
  const dec = p.waitForResponse((r) => r.url().includes('/workflows/approval/') && r.request().method() === 'POST', { timeout: 120000 });
  await item.getByRole('button', { name: 'Approve' }).click();
  const dr = await waitCut(() => dec);
  log('approve', dr.status(), (await dr.text()).slice(0, 200));
  if (dr.status() >= 300) throw new Error('approve failed');
  await p.waitForTimeout(3500);

  loanId = loan.id; loanNo = loan.data?.application_no; finalEnq = enqNo;
  await finalStep();
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify({ email: EMAIL, enquiry_id: enq.id, enquiry_no: enqNo, loan_id: loan.id, application_no: loan.data?.application_no }, null, 2));
} catch (e) {
  if (e?.final) { await finalStep(); } else {
  log('ERROR', e.message);
  await p.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
  process.exitCode = 1; }
} finally {
  fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify({ marks, cuts, email: EMAIL }, null, 2));
  const v = p.video();
  await ctx.close();
  await browser.close();
  if (v) fs.renameSync(await v.path(), `${OUT}/raw.webm`);
  log('done');
}
