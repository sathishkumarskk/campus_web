import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  calculateFlatmateCompatibility,
  PREFERENCE_LABELS,
  type CompatibilityBreakdown,
} from '../lib/compatibility';
import { canDisplayCollegeVerifiedBadge } from '../lib/verification';
import type {
  Conversation,
  DietPreference,
  FlatmateConnection,
  Profile,
  ProfilePrivateContacts,
  SleepSchedule,
  StudentPreferences,
} from '../types/database';
import { ReportModal } from '../components/ReportModal';

interface CandidateRow extends StudentPreferences {
  user: Profile;
}

interface EnrichedCandidate {
  prefs: StudentPreferences;
  peer: Profile;
  compatibility: CompatibilityBreakdown | null;
}

export function FlatmatesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, preferences, blockedUserIds, blockUser } = useAuth();
  const { showToast } = useToast();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [maxBudgetFilter, setMaxBudgetFilter] = useState<number | null>(null);
  const [dietFilter, setDietFilter] = useState<'all' | DietPreference>('all');
  const [sleepFilter, setSleepFilter] = useState<'all' | SleepSchedule>('all');
  const [nonSmokerOnly, setNonSmokerOnly] = useState<boolean>(false);
  const [cityFilter, setCityFilter] = useState<string>('All');

  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [connections, setConnections] = useState<FlatmateConnection[]>([]);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  // Modals State
  const [selectedCandidate, setSelectedCandidate] = useState<EnrichedCandidate | null>(null);
  const [selectedPeerContacts, setSelectedPeerContacts] = useState<ProfilePrivateContacts | null>(
    null
  );
  const [connectTarget, setConnectTarget] = useState<EnrichedCandidate | null>(null);
  const [introMessage, setIntroMessage] = useState<string>('');
  const [submittingConnect, setSubmittingConnect] = useState<boolean>(false);
  const [busyConnId, setBusyConnId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<Profile | null>(null);

  const loadFlatmates = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const prefsQuery = supabase
        .from('student_preferences')
        .select('*, user:profiles!student_preferences_user_id_fkey!inner(*)')
        .neq('hunt_status', 'not_looking')
        .eq('user.is_suspended', false)
        .order('updated_at', { ascending: false })
        .limit(80);

      const [{ data: prefRows, error: prefErr }, connRes] = await Promise.all([
        prefsQuery,
        user
          ? supabase
              .from('flatmate_connections')
              .select('*')
              .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (prefErr) throw new Error(formatSupabaseError(prefErr));

      const validRows = ((prefRows as CandidateRow[] | null) ?? []).filter((row) => {
        if (!row.user) return false;
        if (user && row.user_id === user.id) return false;
        if (blockedUserIds.has(row.user_id)) return false;
        if (row.user.privacy_prefs?.show_profile_in_flatmates === false) return false;
        return true;
      });

      setCandidates(validRows);
      setConnections((connRes.data as FlatmateConnection[] | null) ?? []);
    } catch (err) {
      setError(formatSupabaseError(err, 'Unable to load student flatmate profiles.'));
    } finally {
      setLoading(false);
    }
  }, [blockedUserIds, user]);

  useEffect(() => {
    loadFlatmates();
  }, [loadFlatmates]);

  // Load private contacts when viewing a peer profile if RLS unlocks them
  useEffect(() => {
    if (!selectedCandidate || !user) {
      setSelectedPeerContacts(null);
      return;
    }
    let active = true;
    supabase
      .from('profile_private_contacts')
      .select('*')
      .eq('user_id', selectedCandidate.peer.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setSelectedPeerContacts((data as ProfilePrivateContacts | null) ?? null);
      });
    return () => {
      active = false;
    };
  }, [selectedCandidate, user]);

  const enrichedAndFiltered = useMemo<EnrichedCandidate[]>(() => {
    const q = query.trim().toLowerCase();

    const mapped = candidates
      .filter((row) => {
        if (cityFilter !== 'All') {
          const candidateCity = (row.preferred_city || row.user.city || '').toLowerCase();
          if (candidateCity !== cityFilter.toLowerCase()) return false;
        }
        if (maxBudgetFilter !== null && row.budget_min > maxBudgetFilter) {
          return false;
        }
        if (dietFilter !== 'all' && row.diet !== dietFilter) {
          return false;
        }
        if (sleepFilter !== 'all' && row.sleep_schedule !== sleepFilter) {
          return false;
        }
        if (nonSmokerOnly && row.smoking !== 'no') {
          return false;
        }
        if (q) {
          const hay = [
            row.user.full_name,
            row.user.college_name,
            row.user.course,
            row.user.department,
            row.user.city,
            row.preferred_city,
            row.headline,
            ...(row.preferred_localities || []),
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((row) => {
        const compatibility =
          profile && preferences
            ? calculateFlatmateCompatibility(preferences, profile, row, row.user)
            : null;
        return {
          prefs: row,
          peer: row.user,
          compatibility,
        };
      });

    if (profile && preferences) {
      mapped.sort((a, b) => (b.compatibility?.score ?? 0) - (a.compatibility?.score ?? 0));
    }
    return mapped;
  }, [
    candidates,
    cityFilter,
    dietFilter,
    maxBudgetFilter,
    nonSmokerOnly,
    preferences,
    profile,
    query,
    sleepFilter,
  ]);

  const getActiveConnectionWith = (peerId: string): FlatmateConnection | undefined =>
    connections.find(
      (c) =>
        ((c.sender_id === user?.id && c.receiver_id === peerId) ||
          (c.receiver_id === user?.id && c.sender_id === peerId)) &&
        ['pending', 'accepted'].includes(c.status)
    );

  const handleOpenConnectModal = (item: EnrichedCandidate) => {
    if (!user) {
      navigate('/auth?redirect=/flatmates');
      return;
    }
    if (item.peer.privacy_prefs?.allow_connection_requests === false) {
      showToast({
        variant: 'info',
        title: 'Requests Paused',
        description: 'This student has temporarily paused new connection requests.',
      });
      return;
    }
    setConnectTarget(item);
    setIntroMessage('');
  };

  const handleSendConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !connectTarget) return;

    setSubmittingConnect(true);
    try {
      const score = connectTarget.compatibility?.score ?? 50;
      const { error: insertErr } = await supabase.from('flatmate_connections').insert({
        sender_id: user.id,
        receiver_id: connectTarget.peer.id,
        intro_message: introMessage.trim(),
        compatibility_score: score,
      });

      if (insertErr) throw new Error(formatSupabaseError(insertErr));

      showToast({
        variant: 'success',
        title: 'Connection Request Sent!',
        description: `${connectTarget.peer.full_name} has been notified via CampusCircle.`,
      });
      setConnectTarget(null);
      await loadFlatmates();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Could not send connection request',
        description: formatSupabaseError(err),
      });
    } finally {
      setSubmittingConnect(false);
    }
  };

  const handleUpdateConnection = async (
    conn: FlatmateConnection,
    nextStatus: 'accepted' | 'declined' | 'cancelled'
  ) => {
    setBusyConnId(conn.id);
    try {
      const { error: updErr } = await supabase
        .from('flatmate_connections')
        .update({ status: nextStatus })
        .eq('id', conn.id);
      if (updErr) throw new Error(formatSupabaseError(updErr));

      showToast({
        variant: 'success',
        title:
          nextStatus === 'accepted'
            ? 'Flatmate Connected — Chat Unlocked!'
            : nextStatus === 'declined'
              ? 'Request Declined'
              : 'Request Cancelled',
      });
      await loadFlatmates();
    } catch (err) {
      showToast({ variant: 'error', title: 'Update failed', description: formatSupabaseError(err) });
    } finally {
      setBusyConnId(null);
    }
  };

  const handleOpenChatForConnection = async (connectionId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('context_type', 'flatmate_connection')
      .eq('context_id', connectionId)
      .maybeSingle();

    if (data) {
      navigate(`/messages/${(data as Pick<Conversation, 'id'>).id}`);
    } else {
      navigate('/messages');
    }
  };

  const getInitials = (name: string) =>
    (name || 'CS')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || '')
      .join('');

  return (
    <div className="flex flex-col w-full px-4 lg:px-8 py-4 space-y-4">
      {/* Stitch Header Module */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-label-sm">
              Campus Matches
            </span>
            <span className="text-label-sm text-primary font-semibold tabular-nums">
              {enrichedAndFiltered.length}{' '}
              {enrichedAndFiltered.length === 1 ? 'Active Peer' : 'Active Peers'}
            </span>
          </div>
          <h1 className="text-headline-lg-mobile lg:text-headline-lg text-on-surface font-bold tracking-tight">
            Find a Flatmate
          </h1>
          <p className="text-body-md text-on-surface-variant mt-0.5">
            Connect with college peers who fit your routine, budget, and lifestyle
          </p>
        </div>

        <Link
          to="/profile?tab=preferences"
          className="h-11 px-4 rounded-xl bg-surface-container-lowest text-primary text-label-md font-semibold shadow-xs hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[19px]">tune</span>
          <span>My Match Preferences</span>
        </Link>
      </section>

      {/* Search & Filter Controls matching Stitch */}
      <section className="space-y-3">
        <div className="relative flex items-center w-full">
          <span className="material-symbols-outlined absolute left-3.5 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by college, branch, locality, or city..."
            className="w-full h-11 pl-11 pr-4 rounded-xl bg-surface-container-low text-on-surface placeholder:text-on-surface-variant text-body-md focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <select
            aria-label="Filter by city"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="h-9 px-3 rounded-full bg-surface-container-lowest text-label-sm text-on-surface shadow-xs shrink-0"
          >
            <option value="All">All Cities</option>
            <option value="Chennai">Chennai</option>
            <option value="Bengaluru">Bengaluru</option>
            <option value="Mumbai">Mumbai</option>
            <option value="Delhi">Delhi</option>
            <option value="Hyderabad">Hyderabad</option>
            <option value="Pune">Pune</option>
          </select>

          <button
            type="button"
            onClick={() => setMaxBudgetFilter((prev) => (prev === 8000 ? null : 8000))}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              maxBudgetFilter === 8000
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container text-on-surface'
            }`}
          >
            <span>Budget: &le; ₹8k</span>
            {maxBudgetFilter === 8000 && (
              <span className="material-symbols-outlined text-[14px]">close</span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setDietFilter((prev) => (prev === 'vegetarian' ? 'all' : 'vegetarian'))
            }
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              dietFilter === 'vegetarian'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container text-on-surface'
            }`}
          >
            Diet: Vegetarian
          </button>

          <button
            type="button"
            onClick={() =>
              setSleepFilter((prev) => (prev === 'night_owl' ? 'all' : 'night_owl'))
            }
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              sleepFilter === 'night_owl'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container text-on-surface'
            }`}
          >
            Night Owl
          </button>

          <button
            type="button"
            onClick={() =>
              setSleepFilter((prev) => (prev === 'early_riser' ? 'all' : 'early_riser'))
            }
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              sleepFilter === 'early_riser'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container text-on-surface'
            }`}
          >
            Early Riser
          </button>

          <button
            type="button"
            onClick={() => setNonSmokerOnly((v) => !v)}
            className={`shrink-0 flex items-center gap-1 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              nonSmokerOnly
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container-highest text-on-surface-variant'
            }`}
          >
            <span>Non-Smoker</span>
            {nonSmokerOnly && (
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
            )}
          </button>
        </div>
      </section>

      {/* Stitch Compatibility Explanation Banner */}
      <section>
        <div className="p-3.5 rounded-xl bg-surface-container-low shadow-xs flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[18px]">lightbulb</span>
            </div>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              <strong className="font-semibold text-on-surface">
                Transparent 100-Point Compatibility:
              </strong>{' '}
              {user && preferences
                ? 'Scores are calculated deterministically across diet (20), smoking/lifestyle (20), sleep/study (15), cleanliness (15), budget overlap (15), guest policy (10), and campus proximity (5).'
                : 'Sign in and save your student lifestyle preferences to calculate personalized compatibility scores with every peer.'}
            </p>
          </div>
          {!user && (
            <Link
              to="/auth?redirect=/flatmates"
              className="shrink-0 h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold flex items-center"
            >
              Sign In
            </Link>
          )}
        </div>
      </section>

      {/* Flatmate Cards Stream */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-72 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-surface-container-lowest rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <p className="text-title-md text-error font-semibold">Unable to load flatmate matches</p>
          <p className="text-body-sm text-on-surface-variant">{error}</p>
          <button
            type="button"
            onClick={loadFlatmates}
            className="h-10 px-4 rounded-xl bg-primary text-on-primary text-label-md font-semibold"
          >
            Retry
          </button>
        </div>
      ) : enrichedAndFiltered.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[24px]">group</span>
          </div>
          <h2 className="text-title-md font-semibold text-on-surface">
            No matching student flatmates yet
          </h2>
          <p className="text-body-sm text-on-surface-variant max-w-md mx-auto">
            {isSupabaseConfigured
              ? 'Update your lifestyle preferences to appear in campus searches or broaden your active filters.'
              : 'Connect your Supabase backend credentials to discover real student flatmate profiles and compatibility scores.'}
          </p>
          <Link
            to="/profile?tab=preferences"
            className="inline-flex h-10 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Set Up My Flatmate Profile</span>
          </Link>
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enrichedAndFiltered.map((item) => {
            const { peer, prefs, compatibility } = item;
            const isVerified = canDisplayCollegeVerifiedBadge(peer);
            const activeConn = getActiveConnectionWith(peer.id);
            const isIncomingPending =
              activeConn?.status === 'pending' && activeConn.receiver_id === user?.id;
            const isOutgoingPending =
              activeConn?.status === 'pending' && activeConn.sender_id === user?.id;
            const isConnected = activeConn?.status === 'accepted';

            return (
              <article
                key={peer.id}
                className="rounded-xl bg-surface-container-lowest p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
              >
                <div>
                  {/* Card Top: Avatar, Trust Badge, Compatibility Score */}
                  <div className="flex items-start gap-3.5">
                    <div className="relative shrink-0">
                      {peer.avatar_url ? (
                        <img
                          src={peer.avatar_url}
                          alt={peer.full_name}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-full object-cover shadow-xs"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-primary-fixed text-on-primary-fixed font-bold text-title-md flex items-center justify-center shadow-xs">
                          {getInitials(peer.full_name)}
                        </div>
                      )}
                      {isVerified && (
                        <div
                          title="College Verified"
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-xs"
                        >
                          <span className="material-symbols-outlined text-[13px] material-icon-filled">
                            verified
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-title-md font-semibold text-on-surface truncate">
                          {peer.full_name}
                          {peer.age ? `, ${peer.age}` : ''}
                        </h2>

                        {compatibility && (
                          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed shrink-0 text-label-sm font-semibold tabular-nums">
                            <span className="material-symbols-outlined text-[14px]">bolt</span>
                            <span>{compatibility.score}% Match</span>
                          </div>
                        )}
                      </div>

                      <p className="text-body-sm text-on-surface-variant truncate">
                        {peer.college_name || 'University Student'}
                        {peer.course || peer.department
                          ? ` • ${[peer.course, peer.department].filter(Boolean).join(' ')}`
                          : ''}
                        {peer.semester && peer.privacy_prefs?.show_semester !== false
                          ? ` (Sem ${peer.semester})`
                          : ''}
                      </p>

                      {isVerified && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-[11px] font-medium">
                            <span className="material-symbols-outlined text-[13px] text-primary">
                              school
                            </span>
                            <span>
                              {peer.verification_method === 'domain_email'
                                ? 'Institutional Email Verified'
                                : 'College ID Verified'}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Housing Hunt Box */}
                  <div className="mt-3.5 p-3 rounded-lg bg-surface-container-low flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-on-surface">
                      <span className="material-symbols-outlined text-primary text-[18px]">
                        {prefs.hunt_status === 'have_flat_need_flatmate' ? 'key' : 'apartment'}
                      </span>
                      <span className="text-label-md font-semibold truncate">
                        {prefs.headline ||
                          (prefs.hunt_status === 'have_flat_need_flatmate'
                            ? `Have flat, seeking flatmate in ${prefs.preferred_city || peer.city}`
                            : `Seeking flat & flatmate in ${prefs.preferred_city || peer.city}`)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-body-sm pt-0.5">
                      <span className="flex items-center gap-1 font-semibold text-primary tabular-nums">
                        <span className="material-symbols-outlined text-[16px]">payments</span>
                        <span>
                          ₹{prefs.budget_min.toLocaleString('en-IN')} – ₹
                          {prefs.budget_max.toLocaleString('en-IN')}/mo
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px]">
                          event_available
                        </span>
                        <span>
                          {prefs.move_in_date
                            ? `Move-in: ${new Date(prefs.move_in_date).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                              })}`
                            : 'Flexible Move-in'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Habit Alignment Matrix */}
                  <div className="mt-3.5">
                    {compatibility && (
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                          Habit Alignment
                        </span>
                        <span className="text-label-sm text-primary font-semibold tabular-nums">
                          {compatibility.matchedFactorsCount}/{compatibility.totalFactorsCount} Exact
                          Matches
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary-container/10 text-primary text-label-sm font-medium">
                        {PREFERENCE_LABELS.diet[prefs.diet]}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-container text-on-surface text-label-sm">
                        {PREFERENCE_LABELS.sleep[prefs.sleep_schedule]}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-container text-on-surface text-label-sm">
                        {PREFERENCE_LABELS.cleanliness[prefs.cleanliness]}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-container text-on-surface text-label-sm">
                        {PREFERENCE_LABELS.smoking[prefs.smoking]}
                      </span>
                    </div>
                  </div>

                  {peer.bio && (
                    <p className="mt-3 text-body-sm text-on-surface-variant line-clamp-2 leading-snug">
                      “{peer.bio}”
                    </p>
                  )}
                </div>

                {/* Action Footer */}
                <div className="mt-4 pt-3 border-t border-surface-container flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCandidate(item)}
                    className="flex-1 h-10 px-3 rounded-xl bg-surface-container text-on-surface text-label-md font-semibold hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1"
                  >
                    <span>View Breakdown</span>
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>

                  {isConnected && activeConn ? (
                    <button
                      type="button"
                      onClick={() => handleOpenChatForConnection(activeConn.id)}
                      className="flex-[1.2] h-10 px-3 rounded-xl bg-primary text-on-primary text-label-md font-semibold flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">chat</span>
                      <span>Open Chat</span>
                    </button>
                  ) : isIncomingPending && activeConn ? (
                    <button
                      type="button"
                      disabled={busyConnId === activeConn.id}
                      onClick={() => handleUpdateConnection(activeConn, 'accepted')}
                      className="flex-[1.2] h-10 px-3 rounded-xl bg-secondary text-on-secondary text-label-md font-semibold flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">check</span>
                      <span>Accept Intro</span>
                    </button>
                  ) : isOutgoingPending && activeConn ? (
                    <button
                      type="button"
                      disabled={busyConnId === activeConn.id}
                      onClick={() => handleUpdateConnection(activeConn, 'cancelled')}
                      className="flex-[1.2] h-10 px-3 rounded-xl bg-surface-container-highest text-on-surface-variant text-label-md font-semibold flex items-center justify-center gap-1"
                    >
                      <span>Pending (Cancel)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenConnectModal(item)}
                      className="flex-[1.2] h-10 px-3 rounded-xl bg-primary text-on-primary text-label-md font-semibold hover:bg-primary-container transition-all shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">person_add</span>
                      <span>Connect Request</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Stitch Bottom Callout */}
      <section className="pt-2 pb-4">
        <div className="p-5 rounded-xl bg-surface-container-low text-center flex flex-col items-center">
          <div className="w-10 h-10 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-[22px]">tune</span>
          </div>
          <h3 className="text-title-md text-on-surface font-semibold">
            Want sharper flatmate matches?
          </h3>
          <p className="text-body-sm text-on-surface-variant max-w-md mt-1">
            Keep your budget range, preferred localities, study habits, and diet updated so peers
            from your university can discover and connect with you.
          </p>
          <Link
            to="/profile?tab=preferences"
            className="mt-3.5 px-5 py-2.5 rounded-xl bg-on-surface text-surface text-label-md font-semibold shadow-xs flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">edit_note</span>
            <span>Update Flatmate Preferences</span>
          </Link>
        </div>
      </section>

      {/* Detailed Compatibility Breakdown & Peer Profile Modal */}
      {selectedCandidate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Flatmate profile and compatibility breakdown"
          className="fixed inset-0 z-[65] bg-inverse-surface/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-xl bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-headline-sm font-bold text-on-surface">
                    {selectedCandidate.peer.full_name}
                  </h2>
                  {canDisplayCollegeVerifiedBadge(selectedCandidate.peer) && (
                    <span className="material-symbols-outlined text-primary text-[18px] material-icon-filled">
                      verified
                    </span>
                  )}
                </div>
                <p className="text-body-sm text-on-surface-variant">
                  {selectedCandidate.peer.college_name} • {selectedCandidate.peer.course}{' '}
                  {selectedCandidate.peer.department}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setSelectedCandidate(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {selectedCandidate.peer.bio && (
              <p className="text-body-md text-on-surface bg-surface-container-low p-3.5 rounded-xl">
                {selectedCandidate.peer.bio}
              </p>
            )}

            {selectedCandidate.prefs.preferred_localities?.length > 0 && (
              <div className="text-body-sm">
                <strong className="text-on-surface">Preferred Localities:</strong>{' '}
                <span className="text-on-surface-variant">
                  {selectedCandidate.prefs.preferred_localities.join(', ')}
                </span>
              </div>
            )}

            {/* 7-Factor Transparent Compatibility Breakdown */}
            {selectedCandidate.compatibility ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-title-md font-semibold text-on-surface">
                    7-Factor Compatibility Breakdown
                  </h3>
                  <span className="px-3 py-1 rounded-full bg-primary text-on-primary text-label-sm font-bold tabular-nums">
                    {selectedCandidate.compatibility.score} / 100 pts
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedCandidate.compatibility.factors.map((f) => (
                    <div
                      key={f.key}
                      className="p-3 rounded-xl bg-surface-container-low flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`material-symbols-outlined text-[16px] ${
                              f.status === 'exact'
                                ? 'text-primary'
                                : f.status === 'partial'
                                  ? 'text-secondary'
                                  : 'text-tertiary'
                            }`}
                          >
                            {f.status === 'exact'
                              ? 'check_circle'
                              : f.status === 'partial'
                                ? 'contrast'
                                : 'info'}
                          </span>
                          <span className="text-label-md font-semibold text-on-surface">
                            {f.label}
                          </span>
                        </div>
                        <p className="text-body-sm text-on-surface-variant mt-0.5">
                          Peer: <strong>{f.candidateValueLabel}</strong> • You: {f.viewerValueLabel}
                        </p>
                      </div>
                      <span className="text-label-sm font-bold text-on-surface shrink-0 tabular-nums">
                        {f.earnedPoints}/{f.maxPoints}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-surface-container-low text-body-sm text-on-surface-variant">
                Sign in and configure your preferences to see your exact factor-by-factor score with{' '}
                {selectedCandidate.peer.full_name}.
              </div>
            )}

            {/* Private Contact Unlock Status */}
            {selectedPeerContacts &&
              (selectedPeerContacts.phone_number || selectedPeerContacts.whatsapp_number) && (
                <div className="p-3.5 rounded-xl bg-primary-fixed/30 text-body-sm space-y-1">
                  <p className="font-semibold text-primary">Connected Peer Contact Details</p>
                  {selectedPeerContacts.phone_number && (
                    <p>Phone: {selectedPeerContacts.phone_number}</p>
                  )}
                  {selectedPeerContacts.whatsapp_number && (
                    <p>WhatsApp: {selectedPeerContacts.whatsapp_number}</p>
                  )}
                  <p className="text-[12px] text-on-surface-variant">
                    Contact hours: {selectedPeerContacts.preferred_contact_hours}
                  </p>
                </div>
              )}

            {/* Safety & Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-surface-container">
              <div className="flex items-center gap-2">
                {user && user.id !== selectedCandidate.peer.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedCandidate.peer;
                        setSelectedCandidate(null);
                        setReportTarget(target);
                      }}
                      className="h-9 px-3 rounded-lg bg-surface-container text-on-surface-variant text-label-sm font-semibold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[15px]">flag</span>
                      <span>Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await blockUser(selectedCandidate.peer.id, 'Blocked from Flatmates directory');
                          showToast({
                            variant: 'info',
                            title: `Blocked ${selectedCandidate.peer.full_name}`,
                          });
                          setSelectedCandidate(null);
                          await loadFlatmates();
                        } catch (err) {
                          showToast({
                            variant: 'error',
                            title: 'Block failed',
                            description: formatSupabaseError(err),
                          });
                        }
                      }}
                      className="h-9 px-3 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                    >
                      Block Peer
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const candidate = selectedCandidate;
                  setSelectedCandidate(null);
                  handleOpenConnectModal(candidate);
                }}
                className="h-10 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold"
              >
                Connect with {selectedCandidate.peer.full_name.split(' ')[0]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Request Modal */}
      {connectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Send flatmate connection request"
          className="fixed inset-0 z-[65] bg-inverse-surface/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleSendConnection}
            className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-title-md font-semibold text-on-surface">
                Connect with {connectTarget.peer.full_name}
              </h2>
              <button
                type="button"
                onClick={() => setConnectTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-body-sm text-on-surface-variant">
              Send a short intro note. Once {connectTarget.peer.full_name.split(' ')[0]} accepts,
              private 1:1 chat opens automatically.
            </p>

            <textarea
              rows={3}
              required
              minLength={5}
              value={introMessage}
              onChange={(e) => setIntroMessage(e.target.value)}
              placeholder="Hi! Saw our study habits and Velachery budget overlap—would love to team up for a 2BHK search."
              className="w-full p-3 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConnectTarget(null)}
                className="h-10 px-4 rounded-xl bg-surface-container text-on-surface text-label-md font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingConnect}
                className="h-10 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold disabled:opacity-50"
              >
                {submittingConnect ? 'Sending...' : 'Send Intro Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {reportTarget && (
        <ReportModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          targetType="user"
          targetTitle={reportTarget.full_name}
          targetUserId={reportTarget.id}
        />
      )}
    </div>
  );
}
