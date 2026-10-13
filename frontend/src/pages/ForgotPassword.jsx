import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { authService } from '../services/auth.service';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ identifier }) => {
    setError(null);
    try {
      await authService.forgotPassword(identifier);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Something went wrong. Please try again.');
    }
  };

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

        {sent ? (
          <div>
            <div className="mb-6 flex flex-col items-start">
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Check your email
              </h1>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1.5 leading-relaxed">
                If an account matches what you entered, we&apos;ve sent a password reset link to its email address.
                The link is valid for 1 hour.
              </p>
            </div>
            <Link to="/login">
              <Button variant="outline" size="lg" className="w-full">
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Forgot password?
              </h1>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Enter your Employee ID or email and we&apos;ll send you a reset link.
              </p>
            </div>

            {error && (
              <Alert variant="error" onClose={() => setError(null)} className="mb-5">
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <Input
                label="Employee ID or email"
                placeholder="e.g. ADMIN001"
                autoComplete="username"
                autoFocus
                error={errors.identifier?.message}
                {...register('identifier', {
                  required: 'Employee ID or email is required',
                })}
              />

              <div className="pt-1">
                <Button type="submit" size="lg" loading={isSubmitting} disabled={isSubmitting} className="w-full">
                  <Mail className="h-4 w-4" />
                  Send reset link
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
