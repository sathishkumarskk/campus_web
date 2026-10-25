import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  formatSupabaseError,
  isMissingSchemaError,
  isSupabaseConfigured,
  resolvedSupabaseAnonKey,
  resolvedSupabaseUrl,
  supabase,
  supabaseConfigError,
} from '../lib/supabase';
import type {
  AppNotification,
  Profile,
  ProfilePrivateContacts,
  SavedItem,
  StudentPreferences,
} from '../types/database';
import { useToast } from './ToastContext';

export type SchemaStatus = 'unconfigured' | 'checking' | 'ready' | 'missing_migrations' | 'error';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  preferences: StudentPreferences | null;
  privateContacts: ProfilePrivateContacts | null;
  savedFlatIds: Set<string>;
  savedBookIds: Set<string>;
  blockedUserIds: Set<string>;
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  isPasswordRecoveryMode: boolean;
  isConfigured: boolean;
  configError: string | null;
  schemaStatus: SchemaStatus;
  recheckBackendStatus: () => Promise<boolean>;
  refreshUserData: () => Promise<void>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    fullName: string;
    collegeName: string;
    city: string;
  }) => Promise<{ requiresEmailConfirmation: boolean }>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  signInWithGooglePopup: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  toggleSaveFlat: (flatId: string) => Promise<boolean>;
  toggleSaveBook: (bookId: string) => Promise<boolean>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  blockUser: (targetUserId: string, reason?: string) => Promise<void>;
  unblockUser: (targetUserId: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] = useState<StudentPreferences | null>(null);
  const [privateContacts, setPrivateContacts] = useState<ProfilePrivateContacts | null>(null);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatus>(
    isSupabaseConfigured ? 'checking' : 'unconfigured'
  );
  const schemaStatusRef = useRef<SchemaStatus>(
    isSupabaseConfigured ? 'checking' : 'unconfigured'
  );

  const updateSchemaStatus = useCallback((next: SchemaStatus) => {
    schemaStatusRef.current = next;
    setSchemaStatus(next);
  }, []);

  const probeSchemaReadiness = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured) {
      updateSchemaStatus('unconfigured');
      return false;
    }

    const { error } = await supabase.from('profiles').select('id', { head: true }).limit(1);

    if (!error) {
      updateSchemaStatus('ready');
      return true;
    }

    if (isMissingSchemaError(error)) {
      updateSchemaStatus('missing_migrations');
      return false;
    }

    updateSchemaStatus('error');
    return false;
  }, [updateSchemaStatus]);

  const loadAuthenticatedRecords = useCallback(
    async (authUser: User) => {
      if (!isSupabaseConfigured) return;

      if (schemaStatusRef.current === 'checking') {
        const isReady = await probeSchemaReadiness();
        if (!isReady) return;
      } else if (schemaStatusRef.current === 'missing_migrations') {
        return;
      }

      const [profileRes, prefsRes, contactsRes, savedRes, blocksRes, notifRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('student_preferences').select('*').eq('user_id', authUser.id).maybeSingle(),
        supabase
          .from('profile_private_contacts')
          .select('*')
          .eq('user_id', authUser.id)
          .maybeSingle(),
        supabase.from('saved_items').select('*').eq('user_id', authUser.id),
        supabase.from('user_blocks').select('blocked_id').eq('blocker_id', authUser.id),
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(40),
      ]);

      if (profileRes.error) {
        if (isMissingSchemaError(profileRes.error)) {
          updateSchemaStatus('missing_migrations');
          return;
        }
        showToast({
          variant: 'error',
          title: 'Could not load student profile',
          description: formatSupabaseError(profileRes.error),
        });
        return;
      }

      updateSchemaStatus('ready');
      let resolvedProfile = profileRes.data as Profile | null;

      if (!resolvedProfile) {
        const meta = authUser.user_metadata || {};
        const { data: insertedProfile, error: upsertProfileErr } = await supabase
          .from('profiles')
          .upsert(
            {
              id: authUser.id,
              email: authUser.email || '',
              full_name:
                typeof meta.full_name === 'string' && meta.full_name.trim()
                  ? meta.full_name.trim()
                  : (authUser.email || 'Student').split('@')[0],
              college_name: typeof meta.college_name === 'string' ? meta.college_name : '',
              city: typeof meta.city === 'string' && meta.city ? meta.city : 'Chennai',
            },
            { onConflict: 'id' }
          )
          .select('*')
          .maybeSingle();

        if (upsertProfileErr) {
          showToast({
            variant: 'error',
            title: 'Profile initialization failed',
            description: formatSupabaseError(upsertProfileErr),
          });
        }
        resolvedProfile = (insertedProfile as Profile | null) ?? null;
      }

      let resolvedPrefs = prefsRes.data as StudentPreferences | null;
      if (!resolvedPrefs && !prefsRes.error && resolvedProfile) {
        const { data: insertedPrefs } = await supabase
          .from('student_preferences')
          .upsert(
            {
              user_id: authUser.id,
              preferred_city: resolvedProfile.city || 'Chennai',
            },
            { onConflict: 'user_id' }
          )
          .select('*')
          .maybeSingle();
        resolvedPrefs = (insertedPrefs as StudentPreferences | null) ?? null;
      }

      let resolvedContacts = contactsRes.data as ProfilePrivateContacts | null;
      if (!resolvedContacts && !contactsRes.error && resolvedProfile) {
        const { data: insertedContacts } = await supabase
          .from('profile_private_contacts')
          .upsert({ user_id: authUser.id }, { onConflict: 'user_id' })
          .select('*')
          .maybeSingle();
        resolvedContacts = (insertedContacts as ProfilePrivateContacts | null) ?? null;
      }

      setProfile(resolvedProfile);
      setPreferences(resolvedPrefs);
      setPrivateContacts(resolvedContacts);
      setSavedItems((savedRes.data as SavedItem[] | null) ?? []);
      setBlockedUserIds(
        new Set(((blocksRes.data as { blocked_id: string }[] | null) ?? []).map((b) => b.blocked_id))
      );
      setNotifications((notifRes.data as AppNotification[] | null) ?? []);
    },
    [probeSchemaReadiness, showToast, updateSchemaStatus]
  );

  const clearAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setPreferences(null);
    setPrivateContacts(null);
    setSavedItems([]);
    setBlockedUserIds(new Set());
    setNotifications([]);
  }, []);

  const recheckBackendStatus = useCallback(async (): Promise<boolean> => {
    const ready = await probeSchemaReadiness();
    if (ready && user) {
      await loadAuthenticatedRecords(user);
    }
    return ready;
  }, [loadAuthenticatedRecords, probeSchemaReadiness, user]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const [ready, sessionRes] = await Promise.all([
          probeSchemaReadiness(),
          supabase.auth.getSession(),
        ]);
        if (!active) return;
        const initialSession = sessionRes.data.session;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user && ready) {
          await loadAuthenticatedRecords(initialSession.user);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecoveryMode(true);
      }
      if (event === 'SIGNED_OUT') {
        clearAuthState();
        setIsPasswordRecoveryMode(false);
        return;
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        await loadAuthenticatedRecords(nextSession.user);
      } else {
        clearAuthState();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [clearAuthState, loadAuthenticatedRecords, probeSchemaReadiness]);

  // Real-time notifications subscription for signed-in student (only when DB schema is ready)
  useEffect(() => {
    if (!isSupabaseConfigured || schemaStatus !== 'ready' || !user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const incoming = payload.new as AppNotification;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === incoming.id)) return prev;
            return [incoming, ...prev];
          });
          showToast({
            variant: 'info',
            title: incoming.title,
            description: incoming.body,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schemaStatus, user?.id, showToast]);

  // Listen for popup OAuth completion message from /auth/callback
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const handlePopupMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== 'CAMPUSCIRCLE_OAUTH_CALLBACK') return;

      const searchStr = typeof event.data.search === 'string' ? event.data.search : '';
      const hashStr = typeof event.data.hash === 'string' ? event.data.hash : '';
      const searchParams = new URLSearchParams(searchStr.replace(/^\?/, ''));
      const hashParams = new URLSearchParams(hashStr.replace(/^#/, ''));

      const oauthError =
        searchParams.get('error_description') ||
        hashParams.get('error_description') ||
        searchParams.get('error') ||
        hashParams.get('error');

      if (oauthError) {
        showToast({
          variant: 'error',
          title: 'Google sign-in failed',
          description: oauthError,
        });
        return;
      }

      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          showToast({
            variant: 'error',
            title: 'Google sign-in failed',
            description: formatSupabaseError(error),
          });
        } else {
          showToast({
            variant: 'success',
            title: 'Signed in to CampusCircle',
          });
        }
        return;
      }

      if (hashStr.includes('access_token=')) {
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) {
            showToast({
              variant: 'error',
              title: 'Google sign-in failed',
              description: formatSupabaseError(error),
            });
          } else {
            showToast({ variant: 'success', title: 'Signed in to CampusCircle' });
          }
        }
      }
    };

    window.addEventListener('message', handlePopupMessage);
    return () => window.removeEventListener('message', handlePopupMessage);
  }, [showToast]);

  const refreshUserData = useCallback(async () => {
    if (!user) return;
    await loadAuthenticatedRecords(user);
  }, [loadAuthenticatedRecords, user]);

  const signUpWithEmail = useCallback(
    async (params: {
      email: string;
      password: string;
      fullName: string;
      collegeName: string;
      city: string;
    }) => {
      if (!isSupabaseConfigured) {
        throw new Error(
          supabaseConfigError ||
            'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Secrets.'
        );
      }
      const { data, error } = await supabase.auth.signUp({
        email: params.email.trim(),
        password: params.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: {
            full_name: params.fullName.trim(),
            college_name: params.collegeName.trim(),
            city: params.city.trim(),
          },
        },
      });
      if (error) {
        throw new Error(formatSupabaseError(error, 'Registration failed.'));
      }

      // Supabase returns an obfuscated user with empty identities when email is already registered
      if (
        data.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        throw new Error(
          'An account with this email already exists. Switch to Sign In or use Forgot Password.'
        );
      }

      if (data.session && data.user) {
        if (schemaStatusRef.current === 'ready') {
          await supabase
            .from('profiles')
            .update({
              full_name: params.fullName.trim(),
              college_name: params.collegeName.trim(),
              city: params.city.trim(),
            })
            .eq('id', data.user.id);
        }
        await loadAuthenticatedRecords(data.user);
      }

      return { requiresEmailConfirmation: !data.session };
    },
    [loadAuthenticatedRecords]
  );

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        supabaseConfigError ||
          'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Secrets.'
      );
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw new Error(formatSupabaseError(error, 'Invalid email or password.'));
    }
  }, []);

  const resendConfirmationEmail = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError || 'Supabase is not configured.');
    }
    const trimmed = email.trim();
    if (!trimmed) {
      throw new Error('Enter your email address first to resend the verification link.');
    }
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) {
      throw new Error(formatSupabaseError(error, 'Could not resend verification email.'));
    }
  }, []);

  const signInWithGooglePopup = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error(
        supabaseConfigError ||
          'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Secrets.'
      );
    }

    // Verify Google provider is enabled in Supabase Auth before opening a popup window
    try {
      const settingsRes = await fetch(`${resolvedSupabaseUrl}/auth/v1/settings`, {
        headers: { apikey: resolvedSupabaseAnonKey },
      });
      if (settingsRes.ok) {
        const settings = (await settingsRes.json()) as {
          external?: { google?: boolean };
        };
        if (settings.external && settings.external.google === false) {
          throw new Error(
            'Google Sign-In is currently disabled in your Supabase project. Enable Authentication → Providers → Google in your Supabase Dashboard, or sign in with Email & Password.'
          );
        }
      }
    } catch (checkErr) {
      if (checkErr instanceof Error && checkErr.message.includes('Google Sign-In is currently disabled')) {
        throw checkErr;
      }
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      throw new Error(
        formatSupabaseError(error, 'Google OAuth is not enabled on this Supabase project.')
      );
    }

    const popup = window.open(data.url, 'campuscircle_oauth', 'width=540,height=680');
    if (!popup) {
      throw new Error('Popup was blocked by your browser. Please allow popups for Google sign-in.');
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError || 'Supabase is not configured.');
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth?mode=update-password`,
    });
    if (error) {
      throw new Error(formatSupabaseError(error, 'Could not send password recovery email.'));
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError || 'Supabase is not configured.');
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(formatSupabaseError(error, 'Could not update password.'));
    }
    setIsPasswordRecoveryMode(false);
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(formatSupabaseError(error, 'Sign out failed.'));
    }
    clearAuthState();
  }, [clearAuthState]);

  const savedFlatIds = useMemo(
    () =>
      new Set(
        savedItems.filter((s) => s.item_type === 'flat' && s.flat_id).map((s) => s.flat_id!)
      ),
    [savedItems]
  );

  const savedBookIds = useMemo(
    () =>
      new Set(
        savedItems.filter((s) => s.item_type === 'book' && s.book_id).map((s) => s.book_id!)
      ),
    [savedItems]
  );

  const toggleSaveFlat = useCallback(
    async (flatId: string): Promise<boolean> => {
      if (!user) {
        throw new Error('Please sign in to save accommodation listings.');
      }
      const existing = savedItems.find((s) => s.item_type === 'flat' && s.flat_id === flatId);
      if (existing) {
        const { error } = await supabase.from('saved_items').delete().eq('id', existing.id);
        if (error) throw new Error(formatSupabaseError(error));
        setSavedItems((prev) => prev.filter((s) => s.id !== existing.id));
        return false;
      } else {
        const { data, error } = await supabase
          .from('saved_items')
          .insert({ user_id: user.id, item_type: 'flat', flat_id: flatId })
          .select('*')
          .single();
        if (error) throw new Error(formatSupabaseError(error));
        setSavedItems((prev) => [...prev, data as SavedItem]);
        return true;
      }
    },
    [savedItems, user]
  );

  const toggleSaveBook = useCallback(
    async (bookId: string): Promise<boolean> => {
      if (!user) {
        throw new Error('Please sign in to save textbooks.');
      }
      const existing = savedItems.find((s) => s.item_type === 'book' && s.book_id === bookId);
      if (existing) {
        const { error } = await supabase.from('saved_items').delete().eq('id', existing.id);
        if (error) throw new Error(formatSupabaseError(error));
        setSavedItems((prev) => prev.filter((s) => s.id !== existing.id));
        return false;
      } else {
        const { data, error } = await supabase
          .from('saved_items')
          .insert({ user_id: user.id, item_type: 'book', book_id: bookId })
          .select('*')
          .single();
        if (error) throw new Error(formatSupabaseError(error));
        setSavedItems((prev) => [...prev, data as SavedItem]);
        return true;
      }
    },
    [savedItems, user]
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);
      if (!error) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
        );
      }
    },
    [user]
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  }, [user]);

  const blockUser = useCallback(
    async (targetUserId: string, reason = '') => {
      if (!user) throw new Error('Sign in required.');
      const { error } = await supabase.from('user_blocks').upsert(
        {
          blocker_id: user.id,
          blocked_id: targetUserId,
          reason,
        },
        { onConflict: 'blocker_id,blocked_id' }
      );
      if (error) throw new Error(formatSupabaseError(error, 'Failed to block user.'));
      setBlockedUserIds((prev) => new Set([...prev, targetUserId]));
    },
    [user]
  );

  const unblockUser = useCallback(
    async (targetUserId: string) => {
      if (!user) throw new Error('Sign in required.');
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', targetUserId);
      if (error) throw new Error(formatSupabaseError(error, 'Failed to unblock user.'));
      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
    },
    [user]
  );

  const deleteAccount = useCallback(async () => {
    if (!session?.access_token) {
      throw new Error('Active session required to delete your account.');
    }
    const response = await fetch('/api/account', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'Account deletion failed.');
    }
    await supabase.auth.signOut().catch(() => undefined);
    clearAuthState();
  }, [clearAuthState, session?.access_token]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      preferences,
      privateContacts,
      savedFlatIds,
      savedBookIds,
      blockedUserIds,
      notifications,
      unreadCount,
      loading,
      isPasswordRecoveryMode,
      isConfigured: isSupabaseConfigured,
      configError: supabaseConfigError,
      schemaStatus,
      recheckBackendStatus,
      refreshUserData,
      signUpWithEmail,
      signInWithEmail,
      resendConfirmationEmail,
      signInWithGooglePopup,
      sendPasswordReset,
      updatePassword,
      signOut,
      toggleSaveFlat,
      toggleSaveBook,
      markNotificationRead,
      markAllNotificationsRead,
      blockUser,
      unblockUser,
      deleteAccount,
    }),
    [
      user,
      session,
      profile,
      preferences,
      privateContacts,
      savedFlatIds,
      savedBookIds,
      blockedUserIds,
      notifications,
      unreadCount,
      loading,
      isPasswordRecoveryMode,
      schemaStatus,
      recheckBackendStatus,
      refreshUserData,
      signUpWithEmail,
      signInWithEmail,
      resendConfirmationEmail,
      signInWithGooglePopup,
      sendPasswordReset,
      updatePassword,
      signOut,
      toggleSaveFlat,
      toggleSaveBook,
      markNotificationRead,
      markAllNotificationsRead,
      blockUser,
      unblockUser,
      deleteAccount,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
