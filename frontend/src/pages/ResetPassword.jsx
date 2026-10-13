import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { authService } from '../services/auth.service';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { ArrowLeft, Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();
  const newPassword = watch('new_password');

  const onSubmit = async ({ new_password }) => {
    setError(null);
    try {
      await authService.resetPassword(token, new_password);
      setDone(true);
      // Send the user back to login after a short beat.
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Something went wrong. Please try again.');
    }
  };

  const togglePassword = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      tabIndex={-1}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      className="flex items-center hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
    >
      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-white dark:bg-night-1">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary-500 to-mid-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm font-display">G</span>
          </div>
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-lg font-display">Genesis CRM</span>
        </div>

        {done ? (
          <div>
            <div className="mb-6 flex flex-col items-start">
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Password reset
              </h1>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1.5 leading-relaxed">
                Your password has been updated. Redirecting you to sign in…
              </p>
            </div>
            <Link to="/login">
              <Button variant="outline" size="lg" className="w-full">
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Button>
            </Link>
          </div>
        ) : !token ? (
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-1.5">
              Invalid reset link
            </h1>
            <p className="text-gray-400 dark:text-gray-500 text-sm mb-6 leading-relaxed">
              This link is missing its reset token. Please request a new password reset.
            </p>
            <Link to="/forgot-password">
              <Button variant="primary" size="lg" className="w-full">
                Request a new link
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Set a new password
              </h1>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Choose a strong password you haven&apos;t used before.
              </p>
            </div>

            {error && (
              <Alert variant="error" onClose={() => setError(null)} className="mb-5">
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <Input
                label="New password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                autoFocus
                error={errors.new_password?.message}
                suffix={togglePassword}
                {...register('new_password', {
                  required: 'New password is required',
                  minLength: { value: 8, message: 'Must be at least 8 characters' },
                })}
              />

              <Input
                label="Confirm password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                error={errors.confirm_password?.message}
                {...register('confirm_password', {
                  required: 'Please confirm your password',
                  validate: (v) => v === newPassword || 'Passwords do not match',
                })}
              />

              <div className="pt-1">
                <Button type="submit" size="lg" loading={isSubmitting} disabled={isSubmitting} className="w-full">
                  <KeyRound className="h-4 w-4" />
                  Reset password
                </Button>
              </div>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
