import { chromium } from 'playwright';
import { APP, PW } from './lib/studio.mjs';
const [id, url, shot, ...acts] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${APP}/login`); await p.fill('input[name=employee_id]', id); await p.fill('input[name=password]', PW);
await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.startsWith('/login'));
await p.goto(APP + url); await p.waitForTimeout(3000);
for (const a of acts) { await eval(`(async()=>{${a}})()`); await p.waitForTimeout(1200); }
await p.screenshot({ path: shot });
await b.close();
