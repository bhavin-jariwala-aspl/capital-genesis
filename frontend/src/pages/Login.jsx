import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useAppearanceStore } from '../store/appearanceStore';
import { authService } from '../services/auth.service';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Checkbox from '../components/ui/Checkbox';
import BrandLogo from '../components/ui/BrandLogo';
import { Zap, Shield, BarChart2, Users, Eye, EyeOff } from 'lucide-react';

const FEATURES = [
  { icon: BarChart2, title: 'Smart Dashboards', desc: 'Visualise your pipeline at a glance' },
  { icon: Users,     title: 'Team Collaboration', desc: 'Assign, track, and close as a team' },
  { icon: Shield,    title: 'Enterprise Security', desc: 'Role-based access & audit logs' },
];

/** Split the tagline so the last clause gets the gradient, as a designer would set it. */
function Tagline({ text, className }) {
  const t = (text || '').trim();
  const cut = t.lastIndexOf(',');
  const head = cut > 0 ? t.slice(0, cut + 1) : '';
  const tail = cut > 0 ? t.slice(cut + 1).trim() : t;
  return (
    <h2 className={className}>
      {head && <>{head}<br /></>}
      <span className="bg-gradient-to-r from-cyan-200 to-accent-200 bg-clip-text text-transparent">{tail}</span>
    </h2>
  );
}

/**
 * Sign-in. Wears the remembered workspace brand (logo, name, colours, tagline,
 * layout) so staff see their company, not the vendor, before they sign in —
 * see appearanceStore.applyPreLoginBranding.
 */
/**
 * The second sign-in step: an authenticator code (or a recovery code), or —
 * when the organisation requires MFA and the user has not enrolled — a short
 * enrolment that ends signed in, showing the recovery codes once.
 */
function MfaStep({ mfa, onDone, onCancel, onError }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!mfa.setup) return;
    authService.mfaSetup(mfa.token).then(setSetup).catch((e) => onError(e.response?.data?.error?.message || e.message));
  }, [mfa, onError]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); onError(null);
    try {
      if (mfa.setup) {
        const res = await authService.mfaEnable(code.trim(), mfa.token);
        setRecovery(res.recovery_codes);
        setPending(res);
      } else {
        onDone(await authService.mfaVerify(mfa.token, code.trim()));
      }
    } catch (err) {
      onError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
    } finally { setBusy(false); }
  };

  if (recovery) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-gray-300">Two-factor authentication is on. Keep these recovery codes somewhere safe — each works once if you lose your phone.</p>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-3 font-mono text-sm dark:bg-white/5">{recovery.map((c) => <span key={c}>{c}</span>)}</div>
        <Button size="lg" className="w-full" onClick={() => onDone(pending)}>I have saved them — continue</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mfa.setup ? (
        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>Your organisation requires two-factor authentication. Add this key to an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…), then enter the 6-digit code it shows.</p>
          {setup ? (
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/5">
              <p className="break-all font-mono text-sm tracking-wider">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
              <a href={setup.otpauth_uri} className="mt-1 inline-block text-xs text-primary-600 hover:underline">Open in an authenticator app on this device</a>
            </div>
          ) : <p className="text-xs text-gray-400">Preparing your key…</p>}
        </div>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
      )}
      <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="text" autoFocus />
      <Button type="submit" size="lg" loading={busy} disabled={busy || code.trim().length < 6} className="w-full">{mfa.setup ? 'Turn on and sign in' : 'Verify'}</Button>
      <button type="button" onClick={onCancel} className="w-full text-xs text-gray-500 hover:underline">Back to sign in</button>
    </form>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { token, setAuth } = useAuthStore();
  const appearance = useAppearanceStore((s) => s.current);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  // Second factor (PRD E-02): { token, setup, remember } between password and code.
  const [mfa, setMfa] = useState(null);

  const appName  = appearance['appearance.app_name'] || 'Genesis CRM';
  const tagline  = appearance['appearance.login_tagline'] || 'Your business, beautifully managed.';
  const footer   = appearance['appearance.login_footer'];
  const layout   = appearance['appearance.login_layout'] || 'split';
  const artwork  = appearance['appearance.login_image_url'];
  const poweredBy = appearance['appearance.show_powered_by'] !== false;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { remember: true },
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (token) {
      navigate('/', { replace: true });
    }
  }, [token, navigate]);

  const onSubmit = async ({ employee_id, password, remember }) => {
    setError(null);
    try {
      const res = await authService.login(employee_id, password);
      if (res.mfa_required || res.mfa_setup_required) {
        setMfa({ token: res.mfa_token, setup: Boolean(res.mfa_setup_required), remember });
        return;
      }
      setAuth(res.token, res.employee, remember, res.refresh_token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed. Please try again.');
    }
  };

  const finish = (res, remember) => {
    setAuth(res.token, res.employee, remember, res.refresh_token);
    navigate('/', { replace: true });
  };

  const form = mfa ? (
    <MfaStep mfa={mfa} onDone={(res) => finish(res, mfa.remember)} onCancel={() => setMfa(null)} onError={setError} />
  ) : (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Input
        label="Employee ID"
        placeholder="e.g. GCADMIN"
        autoComplete="username"
        autoFocus
        error={errors.employee_id?.message}
        {...register('employee_id', {
          required: 'Employee ID is required',
          minLength: { value: 3, message: 'Must be at least 3 characters' },
        })}
      />

      <Input
        label="Password"
        type={showPassword ? 'text' : 'password'}
        placeholder="Enter your password"
        autoComplete="current-password"
        error={errors.password?.message}
        suffix={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="flex items-center hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
        {...register('password', {
          required: 'Password is required',
          minLength: { value: 6, message: 'Must be at least 6 characters' },
        })}
      />

      <div className="flex items-center justify-between -mt-1">
        <Checkbox label="Remember me" {...register('remember')} />
        <Link
          to="/forgot-password"
          className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 hover:underline underline-offset-2"
        >
          Forgot password?
        </Link>
      </div>

      <div className="pt-1">
        <Button type="submit" size="lg" loading={isSubmitting} disabled={isSubmitting} className="w-full">
          <Zap className="h-4 w-4" />
          Sign In
        </Button>
      </div>
    </form>
  );

  const heading = (
    <div className="mb-8">
      <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Welcome back</h1>
      <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Sign in to continue to {appName}</p>
    </div>
  );

  const footnote = (footer || poweredBy) && (
    <div className="mt-8 text-center space-y-1">
      {footer && <p className="text-xs text-gray-500 dark:text-gray-400">{footer}</p>}
      {poweredBy && <p className="text-[11px] text-gray-400 dark:text-gray-500">Powered by Genesis</p>}
    </div>
  );

  const errorBlock = error && (
    <Alert variant="error" onClose={() => setError(null)} className="mb-5">{error}</Alert>
  );

  // ── Centered: one floating card, Apple-ID style ─────────────────────────────
  if (layout === 'centered') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-[26rem] animate-slide-up">
          <div className="flex flex-col items-center text-center mb-8">
            <BrandLogo size="xl" showName={false} />
            <p className="mt-4 font-display text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{appName}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">{tagline}</p>
          </div>
          <div className="card p-7 sm:p-8">
            <h1 className="font-display text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Sign in</h1>
            {errorBlock}
            {form}
          </div>
          {footnote}
        </div>
      </div>
    );
  }

  // ── Cover: full-bleed brand panel with the form floating on glass ──────────
  if (layout === 'cover') {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-accent-600">
        {artwork && <img src={artwork} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-luminosity" />}
        <div className="absolute inset-0 bg-gradient-to-t from-primary-950/70 via-primary-900/20 to-transparent" />
        <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-accent-400/30 blur-3xl animate-float pointer-events-none" />
        <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-2 gap-10 items-center">
          <div className="text-white hidden lg:block">
            <BrandLogo size="lg" onDark className="mb-10" />
            <Tagline text={tagline} className="font-display text-5xl font-bold leading-[1.05] tracking-tight mb-5" />
            <p className="text-white/70 text-base max-w-sm">Welcome to {appName}. Sign in to pick up where you left off.</p>
          </div>
          <div className="w-full max-w-md mx-auto lg:ml-auto rounded-3xl p-7 sm:p-9 bg-white/85 dark:bg-night-2/85 backdrop-blur-2xl border border-white/40 dark:border-white/10 shadow-hig-lg animate-slide-up">
            <div className="lg:hidden mb-6"><BrandLogo size="md" /></div>
            {heading}
            {errorBlock}
            {form}
            {footnote}
          </div>
        </div>
        {footer && <p className="absolute bottom-5 left-0 right-0 text-center text-xs text-white/60 hidden lg:block">{footer}</p>}
      </div>
    );
  }

  // ── Split (default): brand panel + form ────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] flex-col justify-between p-12
                      bg-gradient-to-br from-primary-600 via-mid-600 to-accent-600 relative overflow-hidden">
        {artwork && <img src={artwork} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-luminosity" />}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full
                        bg-gradient-to-br from-accent-400/50 to-pink-500/30 blur-3xl pointer-events-none animate-float" />
        <div className="absolute -bottom-40 -left-20 w-80 h-80 rounded-full
                        bg-gradient-to-tr from-cyan-300/40 to-sky-400/20 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="mb-16"><BrandLogo size="lg" onDark /></div>
          <Tagline text={tagline} className="font-display text-4xl font-bold text-white leading-tight mb-4" />
          <p className="text-white/70 text-base leading-relaxed max-w-xs">
            Everything your team needs, in one workspace that looks like you.
          </p>
        </div>

        <div className="relative z-10 space-y-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3.5">
              <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm ring-1 ring-white/25 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">{title}</p>
                <p className="text-xs text-white/60 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative z-10 text-white/50 text-xs">© {new Date().getFullYear()} {appName}{footer ? ` · ${footer}` : ''}</p>
      </div>

      <div className={clsx('flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-night-1')}>
        <div className="lg:hidden mb-10"><BrandLogo size="md" /></div>

        <div className="w-full max-w-sm animate-slide-up">
          {heading}
          {errorBlock}
          {form}
          {footnote}
        </div>
      </div>
    </div>
  );
}
