import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CampusChatbot } from './CampusChatbot';

const PRIMARY_TABS = [
  { path: '/', label: 'Home', icon: 'home', matchPrefix: '/' },
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', matchPrefix: '/dashboard' },
  { path: '/flats', label: 'Flats', icon: 'apartment', matchPrefix: '/flats' },
  { path: '/flatmates', label: 'Flatmates', icon: 'group', matchPrefix: '/flatmates' },
  { path: '/books', label: 'Books', icon: 'menu_book', matchPrefix: '/books' },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user,
    profile,
    notifications,
    unreadCount,
    isConfigured,
    configError,
    schemaStatus,
    recheckBackendStatus,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [recheckingDb, setRecheckingDb] = useState(false);

  const isTabActive = (tabPath: string, matchPrefix: string) => {
    if (tabPath === '/') return location.pathname === '/';
    return location.pathname === tabPath || location.pathname.startsWith(`${matchPrefix}/`);
  };

  const initials = (profile?.full_name || user?.email || 'CC')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const handleQuickSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickQuery.trim();
    setQuickSearchOpen(false);
    if (!q) return;
    if (location.pathname.startsWith('/books')) {
      navigate(`/books?q=${encodeURIComponent(q)}`);
    } else if (location.pathname.startsWith('/flatmates')) {
      navigate(`/flatmates?q=${encodeURIComponent(q)}`);
    } else {
      navigate(`/flats?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      {/* Stitch Top Navigation Bar (Mobile & Desktop Responsive) */}
      <header className="fixed top-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-xl pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto h-16 px-4 lg:px-8 flex items-center justify-between gap-4">
          {/* Brand Lockup matching Google Stitch export */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-primary-fixed flex items-center justify-center p-1.5 shadow-[0_2px_6px_rgba(0,104,95,0.2)]">
              <svg
                className="w-full h-full text-white"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12a4 4 0 0 1 8 0" />
                <path d="M12 8a4 4 0 0 1 0 8" />
                <circle cx="12" cy="12" fill="currentColor" r="1.5" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-title-md text-on-surface tracking-tight leading-none font-semibold">
                CampusCircle
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-primary mt-0.5">
                Student Hub
              </span>
            </div>
          </Link>

          {/* Desktop Primary Navigation */}
          <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-6">
            {PRIMARY_TABS.map((tab) => {
              const active = isTabActive(tab.path, tab.matchPrefix);
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`text-label-md font-medium whitespace-nowrap transition-colors py-1 border-b-2 ${
                    active
                      ? 'text-primary border-primary font-semibold'
                      : 'text-on-surface-variant border-transparent hover:text-on-surface'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
            {user && (
              <>
                <Link
                  to="/activity"
                  className={`text-label-md font-medium whitespace-nowrap transition-colors py-1 border-b-2 ${
                    location.pathname.startsWith('/activity')
                      ? 'text-primary border-primary font-semibold'
                      : 'text-on-surface-variant border-transparent hover:text-on-surface'
                  }`}
                >
                  Activity
                </Link>
                <Link
                  to="/messages"
                  className={`text-label-md font-medium whitespace-nowrap transition-colors py-1 border-b-2 ${
                    location.pathname.startsWith('/messages')
                      ? 'text-primary border-primary font-semibold'
                      : 'text-on-surface-variant border-transparent hover:text-on-surface'
                  }`}
                >
                  Messages
                </Link>
              </>
            )}
            {profile?.role === 'admin' && (
              <Link
                to="/admin"
                className={`text-label-md font-medium whitespace-nowrap transition-colors py-1 border-b-2 ${
                  location.pathname.startsWith('/admin')
                    ? 'text-primary border-primary font-semibold'
                    : 'text-tertiary border-transparent hover:text-on-surface'
                }`}
              >
                Moderation
              </Link>
            )}
          </nav>

          {/* Right Header Controls */}
          <div className="flex items-center gap-1.5 relative">
            <button
              type="button"
              aria-label="Search listings"
              onClick={() => setQuickSearchOpen((v) => !v)}
              className="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">search</span>
            </button>

            {user && (
              <Link
                to="/messages"
                aria-label="Direct messages"
                className="lg:hidden w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[21px]">chat</span>
              </Link>
            )}

            <button
              type="button"
              aria-label="Notifications"
              onClick={() => {
                if (!user) {
                  navigate('/auth');
                  return;
                }
                setNotifOpen((v) => !v);
              }}
              className="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high relative transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[16px] h-4 px-1 rounded-full bg-tertiary text-on-tertiary text-[10px] font-bold flex items-center justify-center ring-2 ring-surface tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {user ? (
              <Link
                to="/profile"
                aria-label="Student profile"
                className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-xs ml-0.5 overflow-hidden text-label-sm font-bold shrink-0"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || 'Profile'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initials || <span className="material-symbols-outlined text-[18px]">person</span>
                )}
              </Link>
            ) : (
              <Link
                to="/auth"
                className="h-9 px-3.5 rounded-xl bg-primary text-on-primary text-label-sm font-semibold flex items-center gap-1 shadow-xs whitespace-nowrap"
              >
                <span>Sign In</span>
              </Link>
            )}

            {/* Notifications Popover */}
            {notifOpen && user && (
              <div className="absolute right-0 top-14 w-80 sm:w-96 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/30 overflow-hidden z-50">
                <div className="px-4 py-3 bg-surface-container-low flex items-center justify-between">
                  <span className="text-title-md font-semibold text-on-surface">Notifications</span>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllNotificationsRead()}
                        className="text-label-sm text-primary font-semibold"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      aria-label="Close notifications"
                      className="text-on-surface-variant"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-surface-container">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-body-sm text-on-surface-variant">
                      No notifications yet. Activity on your room inquiries, flatmate matches, and
                      book handovers will appear here.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={async () => {
                          await markNotificationRead(n.id);
                          setNotifOpen(false);
                          navigate(n.action_path || '/dashboard');
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors flex items-start gap-2.5 ${
                          !n.is_read ? 'bg-primary-fixed/15' : ''
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
                          {n.category === 'book_request' || n.category === 'handover'
                            ? 'menu_book'
                            : n.category === 'message'
                              ? 'chat'
                              : 'notifications_active'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-label-md font-semibold text-on-surface line-clamp-1">
                            {n.title}
                          </p>
                          <p className="text-body-sm text-on-surface-variant line-clamp-2 mt-0.5">
                            {n.body}
                          </p>
                          <span className="text-[11px] text-outline mt-1 block">
                            {new Date(n.created_at).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <div className="p-2.5 bg-surface-container-low text-center">
                  <Link
                    to="/activity"
                    onClick={() => setNotifOpen(false)}
                    className="text-label-sm text-primary font-semibold"
                  >
                    Open Full Activity Center →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Quick Search Bar */}
        {quickSearchOpen && (
          <div className="border-t border-outline-variant/25 bg-surface-container-lowest px-4 py-2.5">
            <form
              onSubmit={handleQuickSearchSubmit}
              className="max-w-3xl mx-auto flex items-center gap-2"
            >
              <input
                type="search"
                autoFocus
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder="Search rooms, colleges, flatmates, or textbooks..."
                className="flex-1 h-10 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit"
                className="h-10 px-4 rounded-xl bg-primary text-on-primary text-label-md font-semibold"
              >
                Search
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 flex flex-col w-full pt-16 pb-24 lg:pb-12">
        {!isConfigured && (
          <div className="bg-error-container text-on-error-container px-4 py-2.5 border-b border-error/20">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-body-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-error shrink-0">
                  error
                </span>
                <span>
                  <strong>Supabase Configuration Error:</strong>{' '}
                  {configError ||
                    'Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Secrets to connect your Supabase project.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {isConfigured && schemaStatus === 'missing_migrations' && (
          <div className="bg-tertiary-fixed text-on-tertiary-fixed px-4 py-2.5 border-b border-tertiary/20">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-body-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-tertiary shrink-0">
                  database
                </span>
                <span>
                  <strong>Supabase Connected — Database Setup Pending:</strong> Open{' '}
                  <strong>Supabase Dashboard → SQL Editor</strong> and run{' '}
                  <code className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">
                    supabase/migrations/000_all_in_one_setup.sql
                  </code>{' '}
                  to create all tables, triggers, and RLS policies.
                </span>
              </div>
              <button
                type="button"
                disabled={recheckingDb}
                onClick={async () => {
                  setRecheckingDb(true);
                  await recheckBackendStatus();
                  setRecheckingDb(false);
                }}
                className="self-start sm:self-auto shrink-0 h-8 px-3 rounded-lg bg-surface-container-lowest text-on-surface text-label-sm font-semibold shadow-xs hover:bg-surface disabled:opacity-50"
              >
                {recheckingDb ? 'Checking...' : 'Re-check Database'}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 w-full max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Stitch 5-Tab Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 pb-safe bg-surface/95 backdrop-blur-xl shadow-[0_-2px_12px_rgba(19,27,46,0.05)]"
      >
        <div className="flex justify-around items-center h-16 px-1.5 max-w-lg mx-auto">
          {PRIMARY_TABS.map((tab) => {
            const active = isTabActive(tab.path, tab.matchPrefix);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 min-w-[56px] h-14 transition-all ${
                  active ? 'text-primary' : 'text-on-surface-variant'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <span
                    className={`material-symbols-outlined text-[22px] transition-transform ${
                      active ? 'material-icon-filled' : ''
                    }`}
                  >
                    {tab.icon}
                  </span>
                  <span
                    className={`absolute -bottom-1 w-1 h-1 rounded-full bg-primary transition-transform duration-200 ${
                      active ? 'scale-100' : 'scale-0'
                    }`}
                  />
                </div>
                <span className="text-[11px] font-medium leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Floating CampusCircle AI Assistant */}
      <CampusChatbot />
    </div>
  );
}
