export const PW = process.env.SEED_STAFF_PASSWORD || 'GenesisDemo#2026';
export async function logout(p) {
  const btn = p.locator('button[aria-label="Sign out"]');
  if (await btn.count()) { await btn.first().click(); await p.waitForURL(u => u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}); }
}
export async function login(p, id, { typeDelay = 0 } = {}) {
  if (!p.url().includes('/login')) {
    await logout(p);
    if (!p.url().includes('/login')) await p.goto('http://localhost:5173/login');
  }
  await p.waitForSelector('input[name=employee_id]', { timeout: 60000 });
  if (typeDelay) {
    await p.click('input[name=employee_id]'); await p.keyboard.type(id, { delay: typeDelay });
    await p.click('input[name=password]'); await p.keyboard.type(PW, { delay: typeDelay / 2 });
  } else {
    await p.fill('input[name=employee_id]', id);
    await p.fill('input[name=password]', PW);
  }
  await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await p.waitForTimeout(2000);
}
export const dump = (p) => p.evaluate(() => [...document.querySelectorAll('input,select,textarea,button,[role=tab],[role=combobox]')].filter(e=>e.offsetParent).map(e => `${e.tagName} name=${e.name} type=${e.type} id=${e.id} lbl=${e.labels?.[0]?.innerText?.slice(0,30)} aria=${e.getAttribute('aria-label')} title=${e.title} txt=${(e.innerText||'').slice(0,40).replace(/\n/g,'|')}`).join('\n'));
export async function settle(p, ms = 1500) {
  const t = Date.now();
  await p.waitForFunction(() => !/Loading\.\.\.|Loading…/.test(document.body.innerText) && !document.querySelector('.animate-spin'), null, { timeout: 120000, polling: 250 }).catch(e => console.log('settle timeout'));
  console.log('settled in', Date.now() - t, 'ms');
  await p.waitForTimeout(ms);
}
