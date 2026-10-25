import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isInstitutionalCollegeEmail } from '../lib/verification';
import { formatSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'update-password';

const INDIAN_HUBS = [
  'Chennai',
  'Bengaluru',
  'Hyderabad',
  'Coimbatore',
  'Pune',
  'Delhi NCR',
  'Mumbai',
];

export function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user,
    isPasswordRecoveryMode,
    isConfigured,
    configError,
    schemaStatus,
    recheckBackendStatus,
    signInWithEmail,
    signUpWithEmail,
    resendConfirmationEmail,
    signInWithGooglePopup,
    sendPasswordReset,
    updatePassword,
  } = useAuth();
  const { showToast } = useToast();

  const rawMode = searchParams.get('mode');
  const initialMode: AuthMode =
    rawMode === 'signup' || rawMode === 'forgot' || rawMode === 'update-password'
      ? rawMode
      : 'signin';
  const redirectTarget = searchParams.get('redirect') || '/dashboard';

  const [mode, setMode] = useState<AuthMode>(
    isPasswordRecoveryMode ? 'update-password' : initialMode
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [city, setCity] = useState('Chennai');
  const [busy, setBusy] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);

  useEffect(() => {
    if (isPasswordRecoveryMode) {
      setMode('update-password');
    }
  }, [isPasswordRecoveryMode]);

  // Handle incoming email confirmation, PKCE code exchange, OTP token_hash, or Auth redirect errors
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const urlErrorDesc =
      searchParams.get('error_description') ||
      hashParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error');

    if (urlErrorDesc) {
      setError(urlErrorDesc.replace(/\+/g, ' '));
      return;
    }

    const tokenHash = searchParams.get('token_hash');
    const otpType = searchParams.get('type') as EmailOtpType | null;
    const code = searchParams.get('code');

    if (tokenHash && otpType) {
      setBusy(true);
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: otpType })
        .then(({ error: verifyErr }) => {
          if (verifyErr) {
            setError(formatSupabaseError(verifyErr, 'Email verification link expired or invalid.'));
          } else if (otpType === 'recovery') {
            setMode('update-password');
            setInfoBanner('Identity verified. Choose your new CampusCircle password below.');
          } else {
            showToast({
              variant: 'success',
              title: 'Email verified!',
              description: 'Your CampusCircle student account is now active.',
            });
          }
          const cleaned = new URLSearchParams(searchParams);
          cleaned.delete('token_hash');
          cleaned.delete('type');
          setSearchParams(cleaned, { replace: true });
        })
        .finally(() => setBusy(false));
      return;
    }

    if (code) {
      setBusy(true);
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error: codeErr }) => {
          if (codeErr) {
            setError(formatSupabaseError(codeErr, 'Authentication link expired or already used.'));
          } else if (searchParams.get('mode') === 'update-password') {
            setMode('update-password');
            setInfoBanner('Identity verified. Set your new password below.');
          } else {
            showToast({
              variant: 'success',
              title: 'Signed in to CampusCircle!',
            });
          }
          const cleaned = new URLSearchParams(searchParams);
          cleaned.delete('code');
          setSearchParams(cleaned, { replace: true });
        })
        .finally(() => setBusy(false));
    }
  }, [location.hash, searchParams, setSearchParams, showToast]);

  useEffect(() => {
    if (user && mode !== 'update-password') {
      navigate(redirectTarget, { replace: true });
    }
  }, [mode, navigate, redirectTarget, user]);

  const institutionalMatch = isInstitutionalCollegeEmail(email);

  const handleResendVerification = async () => {
    const targetEmail = (pendingVerificationEmail || email).trim();
    if (!targetEmail) {
      setError('Enter your email address above first, then click Resend Verification Email.');
      return;
    }
    setResendingEmail(true);
    setError(null);
    try {
      await resendConfirmationEmail(targetEmail);
      setInfoBanner(
        `A fresh verification link was sent to ${targetEmail}. Check your inbox and spam folder.`
      );
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoBanner(null);
    setBusy(true);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        setPendingVerificationEmail(null);
        showToast({ variant: 'success', title: 'Welcome back to CampusCircle!' });
        navigate(redirectTarget, { replace: true });
      } else if (mode === 'signup') {
        if (fullName.trim().length < 2) {
          throw new Error('Please enter your full name.');
        }
        if (collegeName.trim().length < 2) {
          throw new Error('Please enter your college or university name.');
        }
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }
        const { requiresEmailConfirmation } = await signUpWithEmail({
          email,
          password,
          fullName,
          collegeName,
          city,
        });
        if (requiresEmailConfirmation) {
          setPendingVerificationEmail(email.trim());
          setInfoBanner(
            `Account created for ${email.trim()}! Please open your email inbox and click the verification link to activate your CampusCircle session.`
          );
          setMode('signin');
        } else {
          setPendingVerificationEmail(null);
          showToast({
            variant: 'success',
            title: 'Account created!',
            description: 'Complete your student profile and lifestyle quiz.',
          });
          navigate('/profile', { replace: true });
        }
      } else if (mode === 'forgot') {
        await sendPasswordReset(email);
        setInfoBanner(
          'Password recovery link sent! Check your email inbox and follow the link to set a new password.'
        );
      } else if (mode === 'update-password') {
        if (password.length < 8) {
          throw new Error('New password must be at least 8 characters.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        await updatePassword(password);
        showToast({ variant: 'success', title: 'Password updated successfully' });
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      const formatted = formatSupabaseError(err);
      if (
        formatted.toLowerCase().includes('verify your email') ||
        formatted.toLowerCase().includes('email not confirmed')
      ) {
        setPendingVerificationEmail(email.trim());
      }
      setError(formatted);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-6 lg:py-12 max-w-md mx-auto">
      <div className="bg-surface-container-lowest rounded-2xl shadow-md p-5 sm:p-6 space-y-5">
        <div className="space-y-1">
          <span className="text-label-sm text-primary uppercase tracking-wider font-semibold">
            Unified Student Access
          </span>
          <h1 className="text-headline-md text-on-surface font-bold">
            {mode === 'signin' && 'Sign in to CampusCircle'}
            {mode === 'signup' && 'Create Student Account'}
            {mode === 'forgot' && 'Reset Your Password'}
            {mode === 'update-password' && 'Set New Password'}
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            One account for FlatMate accommodation matching and BookBridge free textbook sharing.
          </p>
        </div>

        {(mode === 'signin' || mode === 'signup') && (
          <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-container-low">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`h-9 rounded-lg text-label-md font-semibold transition-all ${
                mode === 'signin'
                  ? 'bg-surface-container-lowest text-primary shadow-xs'
                  : 'text-on-surface-variant'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`h-9 rounded-lg text-label-md font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-surface-container-lowest text-primary shadow-xs'
                  : 'text-on-surface-variant'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {!isConfigured && configError && (
          <div className="p-3.5 rounded-xl bg-error-container text-on-error-container text-body-sm">
            {configError}
          </div>
        )}

        {isConfigured && schemaStatus === 'missing_migrations' && (
          <div className="p-3.5 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed text-body-sm space-y-2">
            <p>
              <strong>Database tables pending:</strong> Run{' '}
              <code className="font-mono text-xs bg-white/60 px-1 py-0.5 rounded">
                supabase/migrations/000_all_in_one_setup.sql
              </code>{' '}
              in your Supabase SQL Editor before registering so your student profile is saved
              automatically.
            </p>
            <button
              type="button"
              onClick={() => recheckBackendStatus()}
              className="text-label-sm font-semibold underline"
            >
              I ran the migration — Re-check now
            </button>
          </div>
        )}

        {infoBanner && (
          <div className="p-3.5 rounded-xl bg-primary-fixed/40 text-on-primary-fixed text-body-sm space-y-2">
            <p>{infoBanner}</p>
            {pendingVerificationEmail && (
              <button
                type="button"
                disabled={resendingEmail}
                onClick={handleResendVerification}
                className="text-label-sm text-primary font-semibold underline disabled:opacity-50"
              >
                {resendingEmail ? 'Sending verification email...' : 'Resend Verification Email'}
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-error-container text-on-error-container text-body-sm space-y-2">
            <p>{error}</p>
            {pendingVerificationEmail && !infoBanner && (
              <button
                type="button"
                disabled={resendingEmail}
                onClick={handleResendVerification}
                className="h-8 px-3 rounded-lg bg-surface-container-lowest text-on-surface text-label-sm font-semibold shadow-xs disabled:opacity-50"
              >
                {resendingEmail ? 'Sending...' : 'Resend Verification Email'}
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="auth-fullname" className="block text-label-sm text-on-surface mb-1">
                  Full Name
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Rohan Subramanian"
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="auth-college"
                    className="block text-label-sm text-on-surface mb-1"
                  >
                    College / University
                  </label>
                  <input
                    id="auth-college"
                    type="text"
                    required
                    value={collegeName}
                    onChange={(e) => setCollegeName(e.target.value)}
                    placeholder="e.g., Anna University"
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="auth-city" className="block text-label-sm text-on-surface mb-1">
                    Campus City
                  </label>
                  <select
                    id="auth-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {INDIAN_HUBS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {mode !== 'update-password' && (
            <div>
              <label htmlFor="auth-email" className="block text-label-sm text-on-surface mb-1">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@college.ac.in or personal email"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {mode === 'signup' && email.includes('@') && (
                <p className="text-[12px] mt-1.5 text-on-surface-variant flex items-center gap-1">
                  <span
                    className={`material-symbols-outlined text-[15px] ${
                      institutionalMatch ? 'text-primary' : 'text-outline'
                    }`}
                  >
                    {institutionalMatch ? 'verified' : 'info'}
                  </span>
                  {institutionalMatch
                    ? 'Institutional academic domain detected — confirming this email automatically grants College Verified status.'
                    : 'Personal email detected — you can still join and verify later by uploading your College ID card.'}
                </p>
              )}
            </div>
          )}

          {(mode === 'signin' || mode === 'signup' || mode === 'update-password') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="auth-password" className="text-label-sm text-on-surface">
                  {mode === 'update-password' ? 'New Password' : 'Password'}
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                    }}
                    className="text-label-sm text-primary font-semibold"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {mode === 'update-password' && (
            <div>
              <label
                htmlFor="auth-confirm-pass"
                className="block text-label-sm text-on-surface mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="auth-confirm-pass"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !isConfigured}
            className="w-full h-11 rounded-xl bg-primary text-on-primary text-label-md font-semibold shadow-xs hover:bg-primary-container disabled:opacity-50 transition-colors"
          >
            {busy
              ? 'Please wait...'
              : mode === 'signin'
                ? 'Sign In'
                : mode === 'signup'
                  ? 'Create Student Account'
                  : mode === 'forgot'
                    ? 'Send Recovery Link'
                    : 'Update Password'}
          </button>
        </form>

        {(mode === 'signin' || mode === 'signup') && (
          <>
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-outline-variant/40" />
              <span className="px-3 text-label-sm text-outline">or continue with</span>
              <div className="flex-grow border-t border-outline-variant/40" />
            </div>

            <button
              type="button"
              disabled={busy || !isConfigured}
              onClick={handleGoogleSignIn}
              className="w-full h-11 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-label-md font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[19px] text-primary">
                account_circle
              </span>
              <span>Google Account (Popup)</span>
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => setMode('signin')}
            className="w-full text-center text-label-sm text-primary font-semibold"
          >
            ← Back to Sign In
          </button>
        )}
      </div>
    </div>
  );
}
