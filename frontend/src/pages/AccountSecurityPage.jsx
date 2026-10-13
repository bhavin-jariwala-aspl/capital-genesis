import { useState } from 'react';
import { ShieldCheck, KeyRound, LogOut, CalendarDays, Copy } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/authStore';
import { confirmDialog, showError, showSuccess } from '../utils/dialog';

/**
 * My account ▸ Security — password, two-factor authentication and sessions
 * (PRD E-01 / E-02), and the personal calendar feed (RM-FR-03). Turning MFA on asks for a first code and shows the
 * recovery codes once; "sign out everywhere" ends every session at once.
 */
const errText = (e) => e?.response?.data?.error?.message ?? e?.response?.data?.message ?? e?.message;

function Card({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-night-2">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><Icon className="h-4 w-4 text-primary-600" />{title}</h2>
      {children}
    </section>
  );
}

export default function AccountSecurityPage() {
  const logout = useAuthStore((s) => s.logout);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [enrol, setEnrol] = useState(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(null);
  const [disableCode, setDisableCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [mfaOn, setMfaOn] = useState(null);
  const [feedUrl, setFeedUrl] = useState(null);

  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { showError(errText(e)); } finally { setBusy(null); } };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <PageHeader icon={ShieldCheck} eyebrow="My account" title="Security" subtitle="Password, two-factor authentication and active sessions." />

      <Card icon={KeyRound} title="Change password">
        <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => {
          e.preventDefault();
          if (pw.next !== pw.confirm) { showError('The new passwords do not match'); return; }
          run('pw', async () => {
            await authService.changePassword(pw.current, pw.next);
            await showSuccess('Password changed. Please sign in again.');
            logout();
          });
        }}>
          <Input label="Current password" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          <Input label="New password" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} />
          <Input label="Confirm" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
          <div className="md:col-span-3"><Button type="submit" loading={busy === 'pw'}>Change password</Button></div>
        </form>
      </Card>

      <Card icon={ShieldCheck} title="Two-factor authentication">
        {recovery ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-white/80">Two-factor authentication is on. Save these recovery codes — each can be used once if you lose your phone. They will not be shown again.</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-3 font-mono text-sm dark:bg-white/5">{recovery.map((c) => <span key={c}>{c}</span>)}</div>
            <Button onClick={() => setRecovery(null)}>Done</Button>
          </div>
        ) : enrol ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run('enable', async () => { const r = await authService.mfaEnable(code.trim()); setRecovery(r.recovery_codes); setEnrol(null); setCode(''); setMfaOn(true); }); }}>
            <p className="text-sm text-gray-700 dark:text-white/80">Add this key to your authenticator app, then enter the code it shows.</p>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/5">
              <p className="break-all font-mono text-sm tracking-wider">{enrol.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
              <a href={enrol.otpauth_uri} className="mt-1 inline-block text-xs text-primary-600 hover:underline">Open in an authenticator app on this device</a>
            </div>
            <Input label="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
            <div className="flex gap-2"><Button type="submit" loading={busy === 'enable'} disabled={code.trim().length !== 6}>Turn on</Button><Button variant="ghost" type="button" onClick={() => setEnrol(null)}>Cancel</Button></div>
          </form>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            {mfaOn !== true && <Button onClick={() => run('setup', async () => { setEnrol(await authService.mfaSetup()); })} loading={busy === 'setup'}>Set up two-factor authentication</Button>}
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run('disable', async () => { await authService.mfaDisable(disableCode.trim()); setMfaOn(false); setDisableCode(''); showSuccess('Two-factor authentication is off.'); }); }}>
              <Input label="To turn it off, enter a current code" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} inputMode="numeric" maxLength={6} wrapperClass="w-60" />
              <Button type="submit" variant="secondary" loading={busy === 'disable'} disabled={disableCode.trim().length !== 6}>Turn off</Button>
            </form>
          </div>
        )}
      </Card>

      <Card icon={CalendarDays} title="Calendar feed">
        <p className="mb-3 text-sm text-gray-600 dark:text-white/60">Subscribe from Outlook, Google or Apple Calendar to see your meetings, calls, task due dates and reminders. Keep the link private; signing out everywhere replaces it.</p>
        {feedUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-white/5">{feedUrl}</code>
            <Button variant="secondary" onClick={async () => {
              try { await navigator.clipboard.writeText(feedUrl); showSuccess('Link copied.'); } catch { showError('Copy failed. Select the link and copy it manually.'); }
            }}><Copy className="mr-1.5 h-4 w-4" />Copy</Button>
          </div>
        ) : (
          <Button variant="secondary" loading={busy === 'cal'} onClick={() => run('cal', async () => {
            const { path } = await authService.calendarSubscription();
            setFeedUrl(`${window.location.origin}${path}`);
          })}>Show my calendar link</Button>
        )}
      </Card>

      <Card icon={LogOut} title="Sessions">
        <p className="mb-3 text-sm text-gray-600 dark:text-white/60">Signed in on a shared or lost device? End every session, including this one.</p>
        <Button variant="secondary" loading={busy === 'all'} onClick={async () => {
          if (!(await confirmDialog({ title: 'Sign out everywhere?', message: 'Every device, including this one, will need to sign in again.', confirmLabel: 'Sign out everywhere' }))) return;
          run('all', async () => { await authService.signOutEverywhere(); logout(); });
        }}>Sign out everywhere</Button>
      </Card>
    </div>
  );
}
