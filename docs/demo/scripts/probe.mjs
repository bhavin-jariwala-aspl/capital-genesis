// Development aid for writing scenarios: sign in, open a page, save a screenshot and list the visible controls.
//   node probe.mjs GCRM1 /module/87/object/163 [out.png] [--click "Button text"]...
import { chromium } from 'playwright';
import { APP, PW } from './lib/studio.mjs';

const [id, url = '/', shot = '.raw/probe.png', ...rest] = process.argv.slice(2);
const clicks = [];
for (let i = 0; i < rest.length; i++) if (rest[i] === '--click') clicks.push(rest[++i]);
const browser = await chromium.launch({ channel: 'chrome' });
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
if (id !== '-') {
  await p.goto(`${APP}/login`);
  await p.fill('input[name=employee_id]', id);
  await p.fill('input[name=password]', PW);
  await p.click('button[type=submit]');
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
}
await p.goto(url.startsWith('http') ? url : APP + url);
await p.waitForTimeout(2500);
for (const c of clicks) { await p.getByText(c, { exact: true }).first().click(); await p.waitForTimeout(1500); }
await p.screenshot({ path: shot });
const rows = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea,button,a[href],[role=tab]')]
  .filter((e) => e.offsetParent)
  .map((e) => [e.tagName.toLowerCase(), e.id && `#${e.id}`, e.name && `name=${e.name}`, e.type && e.tagName === 'INPUT' ? `type=${e.type}` : '',
    e.getAttribute('aria-label') && `aria="${e.getAttribute('aria-label')}"`, e.title && `title="${e.title}"`,
    e.getAttribute('href') && `href=${e.getAttribute('href')}`,
    (e.innerText || e.value || e.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 60)].filter(Boolean).join(' ')));
console.log(rows.join('\n'));
await browser.close();
