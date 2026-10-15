import { PW } from './lib.mjs';
const B = 'http://localhost:3001/api';
export async function tok(id) {
  const r = await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employee_id: id, password: PW }) });
  const j = await r.json(); const d = j.data ?? j;
  return d.access_token ?? d.token ?? d.accessToken ?? (console.log(Object.keys(d)), null);
}
export async function api(t, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000) });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  return { status: r.status, body: j };
}
