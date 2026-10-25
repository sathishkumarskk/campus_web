import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, profile, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-12 space-y-4">
        <div className="h-24 rounded-xl bg-surface-container animate-pulse" />
        <div className="h-40 rounded-xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  if (!user) {
    const nextPath = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${nextPath}`} replace />;
  }

  if (profile?.is_suspended) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-md text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-error-container text-on-error-container flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[24px]">gavel</span>
          </div>
          <h1 className="text-headline-sm text-on-surface">Account Suspended</h1>
          <p className="text-body-md text-on-surface-variant">
            Your CampusCircle account is currently suspended by campus moderation.
          </p>
          {profile.suspension_reason && (
            <p className="text-body-sm bg-surface-container-low p-3 rounded-xl text-on-surface">
              Reason: {profile.suspension_reason}
            </p>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full h-11 rounded-xl bg-on-surface text-surface text-label-md font-semibold"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (requireAdmin && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
