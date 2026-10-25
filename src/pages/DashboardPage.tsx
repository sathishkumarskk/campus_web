import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { formatSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  calculateFlatmateCompatibility,
  PREFERENCE_LABELS,
  type CompatibilityBreakdown,
} from '../lib/compatibility';
import { CONDITION_METADATA } from '../lib/bookStateMachine';
import {
  calculateProfileCompletion,
  canDisplayCollegeVerifiedBadge,
} from '../lib/verification';
import type {
  AccommodationImage,
  AccommodationListing,
  BookListing,
  BookRequest,
  Conversation,
  FlatmateConnection,
  Profile,
  StudentPreferences,
} from '../types/database';
import { ResilientImage } from '../components/ResilientImage';

interface TopMatchState {
  peer: Profile;
  prefs: StudentPreferences;
  breakdown: CompatibilityBreakdown;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const {
    user,
    profile,
    preferences,
    savedFlatIds,
    savedBookIds,
    blockedUserIds,
    unreadCount,
  } = useAuth();

  const [globalSearch, setGlobalSearch] = useState('');
  const [recommendedFlats, setRecommendedFlats] = useState<AccommodationListing[]>([]);
  const [flatCountInCity, setFlatCountInCity] = useState<number>(0);
  const [recentBooks, setRecentBooks] = useState<BookListing[]>([]);
  const [bookCountAvailable, setBookCountAvailable] = useState<number>(0);
  const [topMatch, setTopMatch] = useState<TopMatchState | null>(null);
  const [acceptedConnection, setAcceptedConnection] = useState<FlatmateConnection | null>(null);
  const [activeBookHandover, setActiveBookHandover] = useState<BookRequest | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const targetCity = profile?.city || preferences?.preferred_city || '';

      let flatsQuery = supabase
        .from('accommodation_listings')
        .select('*, owner:profiles!accommodation_listings_owner_id_fkey(*), images:accommodation_images(*)', {
          count: 'exact',
        })
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(6);

      if (targetCity) {
        flatsQuery = flatsQuery.ilike('city', targetCity);
      }

      let booksQuery = supabase
        .from('book_listings')
        .select('*, donor:profiles!book_listings_donor_id_fkey(*)', { count: 'exact' })
        .eq('availability_status', 'available')
        .order('created_at', { ascending: false })
        .limit(4);

      if (profile?.department) {
        booksQuery = booksQuery.ilike('department', `%${profile.department}%`);
      }

      const [flatsRes, booksRes, peersRes, connRes, handoverRes] = await Promise.all([
        flatsQuery,
        booksQuery,
        supabase
          .from('student_preferences')
          .select('*, user:profiles!student_preferences_user_id_fkey!inner(*)')
          .neq('user_id', user.id)
          .neq('hunt_status', 'not_looking')
          .eq('user.is_suspended', false)
          .limit(30),
        supabase
          .from('flatmate_connections')
          .select(
            '*, sender:profiles!flatmate_connections_sender_id_fkey(*), receiver:profiles!flatmate_connections_receiver_id_fkey(*)'
          )
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .eq('status', 'accepted')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('book_requests')
          .select('*, book:book_listings(*)')
          .or(`donor_id.eq.${user.id},requester_id.eq.${user.id}`)
          .in('status', ['accepted', 'reserved', 'handover_scheduled'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const normalizedFlats = ((flatsRes.data as AccommodationListing[] | null) ?? []).map((f) => ({
        ...f,
        images: [...(f.images || [])].sort(
          (a: AccommodationImage, b: AccommodationImage) => a.display_order - b.display_order
        ),
      }));

      setRecommendedFlats(normalizedFlats);
      setFlatCountInCity(flatsRes.count ?? normalizedFlats.length);
      setRecentBooks((booksRes.data as BookListing[] | null) ?? []);
      setBookCountAvailable(booksRes.count ?? 0);
      setAcceptedConnection((connRes.data as FlatmateConnection | null) ?? null);
      setActiveBookHandover((handoverRes.data as BookRequest | null) ?? null);

      if (profile && preferences && peersRes.data) {
        const candidates = (peersRes.data as (StudentPreferences & { user: Profile })[]).filter(
          (row) =>
            row.user &&
            !blockedUserIds.has(row.user_id) &&
            row.user.privacy_prefs?.show_profile_in_flatmates !== false
        );

        let best: TopMatchState | null = null;
        for (const row of candidates) {
          const breakdown = calculateFlatmateCompatibility(preferences, profile, row, row.user);
          if (!best || breakdown.score > best.breakdown.score) {
            best = { peer: row.user, prefs: row, breakdown };
          }
        }
        setTopMatch(best);
      } else {
        setTopMatch(null);
      }
    } catch (err) {
      setError(formatSupabaseError(err, 'Failed to load dashboard summary.'));
    } finally {
      setLoading(false);
    }
  }, [blockedUserIds, preferences, profile, user]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = globalSearch.trim();
    if (!q) return;
    navigate(`/flats?q=${encodeURIComponent(q)}`);
  };

  const handleOpenAcceptedChat = async () => {
    if (!acceptedConnection) return;
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('context_type', 'flatmate_connection')
      .eq('context_id', acceptedConnection.id)
      .maybeSingle();

    if (data) {
      navigate(`/messages/${(data as Pick<Conversation, 'id'>).id}`);
    } else {
      navigate('/messages');
    }
  };

  const firstName = (profile?.full_name || user?.email?.split('@')[0] || 'Student').split(' ')[0];
  const initials = (profile?.full_name || firstName)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const completionPct = calculateProfileCompletion(profile, preferences);
  const isVerified = canDisplayCollegeVerifiedBadge(profile);
  const matchedPeerName =
    acceptedConnection?.sender_id === user?.id
      ? acceptedConnection?.receiver?.full_name
      : acceptedConnection?.sender?.full_name;

  return (
    <div className="flex flex-col w-full px-4 lg:px-8 pt-3 pb-10 space-y-5">
      {/* Stitch Personalized Welcome Header */}
      <section className="bg-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-headline-lg-mobile lg:text-headline-lg text-on-surface font-bold">
              Hey, {firstName}
            </h1>
            <p className="text-body-sm text-on-surface-variant mt-1 truncate">
              {profile?.college_name
                ? `${profile.college_name}${
                    profile.course || profile.department
                      ? ` • ${[
                          profile.semester ? `Sem ${profile.semester}` : '',
                          profile.course,
                          profile.department,
                        ]
                          .filter(Boolean)
                          .join(' ')}`
                      : ''
                  }`
                : 'Complete your college, branch & semester details to unlock campus matches'}
            </p>
          </div>

          <Link
            to="/profile"
            aria-label="Edit student profile"
            className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center shrink-0 shadow-xs relative overflow-hidden"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-title-md font-semibold text-on-primary-fixed">{initials}</span>
            )}
            {isVerified && (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-primary rounded-full flex items-center justify-center ring-2 ring-surface-container-lowest">
                <span className="material-symbols-outlined text-on-primary text-[10px] material-icon-filled">
                  check
                </span>
              </span>
            )}
          </Link>
        </div>

        {/* Verification & Profile Completion Gauge */}
        <div className="mt-3.5 bg-surface-container-low rounded-lg p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {isVerified ? (
                <>
                  <span className="material-symbols-outlined text-primary text-[18px] material-icon-filled">
                    verified
                  </span>
                  <span className="text-label-sm text-primary font-semibold truncate">
                    {profile?.verification_method === 'domain_email'
                      ? 'College Email Verified ✓'
                      : 'College ID Verified ✓'}
                  </span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-tertiary text-[18px]">
                    verified_user
                  </span>
                  <Link
                    to="/profile?tab=verification"
                    className="text-label-sm text-tertiary font-semibold hover:underline truncate"
                  >
                    Verify College Status →
                  </Link>
                </>
              )}
            </div>
            <Link
              to="/profile"
              className="text-label-sm text-on-surface font-semibold shrink-0 tabular-nums hover:text-primary"
            >
              {completionPct}% Complete
            </Link>
          </div>
          <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Global Search & Location Pill */}
      <section className="space-y-2">
        <form
          onSubmit={handleGlobalSearch}
          className="relative flex items-center bg-surface-container-lowest rounded-xl shadow-xs px-3.5 py-2"
        >
          <span className="material-symbols-outlined text-on-surface-variant text-[22px] mr-2.5">
            search
          </span>
          <input
            type="search"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search rooms, flatmates, or textbooks..."
            className="w-full h-8 bg-transparent text-body-md text-on-surface placeholder:text-outline focus:outline-none"
          />
          <button
            type="submit"
            className="h-8 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold shrink-0"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={profile?.city ? `/flats?city=${encodeURIComponent(profile.city)}` : '/profile'}
            className="inline-flex items-center gap-1 px-3 py-1 bg-surface-container rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-primary text-[15px]">location_on</span>
            <span className="text-label-sm text-on-surface">
              {profile?.city || 'Set Campus City'}
              {profile?.college_name ? ` (${profile.college_name})` : ''}
            </span>
          </Link>

          <Link
            to="/activity"
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-lowest rounded-full text-label-sm text-on-surface shadow-xs hover:text-primary"
          >
            <span className="material-symbols-outlined text-[15px] text-secondary">bookmark</span>
            <span className="tabular-nums">
              {savedFlatIds.size + savedBookIds.size} Saved • {unreadCount} Unread
            </span>
          </Link>
        </div>
      </section>

      {/* Real Database Active Status Banners */}
      {(acceptedConnection || activeBookHandover) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {acceptedConnection && (
            <div className="bg-tertiary-fixed text-on-tertiary-fixed p-3.5 rounded-xl shadow-xs flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">push_pin</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-label-sm font-semibold tracking-wide uppercase text-on-tertiary-fixed-variant">
                    Match Update
                  </span>
                  <span className="text-label-sm text-tertiary tabular-nums">
                    {acceptedConnection.compatibility_score}% Match
                  </span>
                </div>
                <p className="text-body-sm font-medium mt-0.5">
                  Connected with <strong>{matchedPeerName || 'Campus Peer'}</strong>. Direct chat is
                  open.
                </p>
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={handleOpenAcceptedChat}
                    className="px-3.5 py-1.5 bg-primary text-on-primary rounded-lg text-label-md font-semibold flex items-center gap-1.5 shadow-xs"
                  >
                    <span>View Chat</span>
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeBookHandover && (
            <div className="bg-surface-container-high text-on-surface p-3.5 rounded-xl shadow-xs flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">menu_book</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-label-sm font-semibold text-secondary">
                    BookBridge Handover
                  </span>
                  <span className="text-label-sm text-outline capitalize">
                    {activeBookHandover.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-body-sm text-on-surface mt-0.5">
                  <strong className="font-semibold">
                    {activeBookHandover.book?.title || 'Reserved Textbook'}
                  </strong>{' '}
                  pickup at <strong>{activeBookHandover.proposed_spot}</strong> (
                  {activeBookHandover.proposed_time}).
                </p>
                <Link
                  to="/activity?tab=books"
                  className="inline-block mt-2 text-label-sm text-secondary font-semibold hover:underline"
                >
                  Manage Handover →
                </Link>
              </div>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-error-container text-on-error-container text-body-sm">
          {error}
        </div>
      )}

      {/* Stitch Dual Quick Service Hub Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* FlatMate Hub Card */}
        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center mb-2.5">
              <span className="material-symbols-outlined text-[24px]">vpn_key</span>
            </div>
            <h2 className="text-title-md font-semibold text-on-surface leading-tight">
              FlatMate Hub
            </h2>
            <p className="text-body-sm text-primary font-medium mt-1 tabular-nums">
              {flatCountInCity} active {flatCountInCity === 1 ? 'stay' : 'stays'}
              {profile?.city ? ` in ${profile.city}` : ''}
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-1 bg-surface-container-low rounded-lg p-2">
            <Link
              to="/flats"
              className="w-full text-label-sm text-on-surface hover:text-primary font-semibold flex items-center justify-between py-1.5 px-2 rounded"
            >
              <span>Browse Flats</span>
              <span className="material-symbols-outlined text-[16px] text-outline">
                chevron_right
              </span>
            </Link>
            <Link
              to="/flatmates"
              className="w-full text-label-sm text-on-surface hover:text-primary font-semibold flex items-center justify-between py-1.5 px-2 rounded"
            >
              <span>Find Flatmate</span>
              <span className="material-symbols-outlined text-[16px] text-outline">
                chevron_right
              </span>
            </Link>
            <Link
              to="/flats/new"
              className="w-full text-label-sm text-primary font-semibold flex items-center justify-between py-1.5 px-2 rounded"
            >
              <span>Post a Vacant Room</span>
              <span className="material-symbols-outlined text-[16px]">add</span>
            </Link>
          </div>
        </div>

        {/* BookBridge Hub Card */}
        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-highest text-secondary flex items-center justify-center mb-2.5">
              <span className="material-symbols-outlined text-[24px]">library_books</span>
            </div>
            <h2 className="text-title-md font-semibold text-on-surface leading-tight">
              BookBridge Hub
            </h2>
            <p className="text-body-sm text-secondary font-medium mt-1 tabular-nums">
              {bookCountAvailable} {profile?.department ? `${profile.department} ` : ''}
              {bookCountAvailable === 1 ? 'textbook' : 'textbooks'} available
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-1 bg-surface-container-low rounded-lg p-2">
            <Link
              to="/books"
              className="w-full text-label-sm text-on-surface hover:text-secondary font-semibold flex items-center justify-between py-1.5 px-2 rounded"
            >
              <span>Find Textbooks</span>
              <span className="material-symbols-outlined text-[16px] text-outline">
                chevron_right
              </span>
            </Link>
            <Link
              to="/books/new"
              className="w-full text-label-sm text-secondary font-semibold flex items-center justify-between py-1.5 px-2 rounded"
            >
              <span>Donate or Swap Book</span>
              <span className="material-symbols-outlined text-[16px]">volunteer_activism</span>
            </Link>
            <Link
              to="/activity"
              className="w-full text-label-sm text-on-surface hover:text-secondary font-semibold flex items-center justify-between py-1.5 px-2 rounded"
            >
              <span>My Activity &amp; Requests</span>
              <span className="material-symbols-outlined text-[16px] text-outline">
                chevron_right
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Recommended Flats Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[20px]">apartment</span>
            <h2 className="text-headline-sm text-on-surface font-semibold">Recommended Flats</h2>
          </div>
          <Link
            to="/flats"
            className="text-label-sm text-primary font-semibold flex items-center"
          >
            <span>See All ({flatCountInCity})</span>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-56 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : recommendedFlats.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-title-md font-semibold text-on-surface">
                No published rooms in {profile?.city || 'your city'} yet
              </p>
              <p className="text-body-sm text-on-surface-variant">
                Have a vacant spot in your apartment? List it for campus peers with zero brokerage.
              </p>
            </div>
            <Link
              to="/flats/new"
              className="h-10 px-4 rounded-xl bg-primary text-on-primary text-label-sm font-semibold flex items-center justify-center shrink-0"
            >
              Post a Room
            </Link>
          </div>
        ) : (
          <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1">
            {recommendedFlats.map((flat) => (
              <article
                key={flat.id}
                className="min-w-[270px] max-w-[290px] bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden flex flex-col shrink-0"
              >
                <Link to={`/flats/${flat.id}`} className="relative h-36 w-full block">
                  <ResilientImage
                    src={flat.images?.[0]?.public_url}
                    alt={flat.title}
                    fallbackIcon="apartment"
                    fallbackLabel={flat.locality}
                  />
                  {canDisplayCollegeVerifiedBadge(flat.owner) && (
                    <span className="absolute top-2.5 left-2.5 bg-surface-container-lowest/90 backdrop-blur-md px-2 py-0.5 rounded-full text-label-sm text-primary font-semibold flex items-center gap-1 shadow-xs">
                      <span className="material-symbols-outlined text-[13px] material-icon-filled">
                        verified
                      </span>
                      <span>Verified</span>
                    </span>
                  )}
                  <span className="absolute bottom-2.5 right-2.5 bg-primary text-on-primary px-2.5 py-0.5 rounded text-label-sm font-semibold shadow-xs tabular-nums">
                    ₹{flat.rent_monthly.toLocaleString('en-IN')}
                    <span className="font-normal text-[10px]">/mo</span>
                  </span>
                </Link>

                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <Link to={`/flats/${flat.id}`}>
                      <h3 className="text-title-md font-semibold text-on-surface line-clamp-1 hover:text-primary">
                        {flat.title}
                      </h3>
                    </Link>
                    <p className="text-body-sm text-on-surface-variant flex items-center gap-1 mt-0.5 line-clamp-1">
                      <span className="material-symbols-outlined text-[14px] shrink-0">
                        near_me
                      </span>
                      <span className="truncate">
                        {flat.distance_km !== null && flat.distance_km !== undefined
                          ? `${flat.distance_km} km from ${flat.nearby_college}`
                          : flat.nearby_college}{' '}
                        • {flat.locality}
                      </span>
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between bg-surface-container-low rounded-lg px-2.5 py-1.5">
                    <span className="text-label-sm text-tertiary font-semibold tabular-nums">
                      {flat.spots_available} {flat.spots_available === 1 ? 'Spot' : 'Spots'} left
                    </span>
                    <Link
                      to={`/flats/${flat.id}`}
                      className="text-label-sm text-primary font-semibold flex items-center gap-0.5"
                    >
                      <span>Explore</span>
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Roommate Match Spotlight */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[20px]">
                person_search
              </span>
              <h2 className="text-headline-sm text-on-surface font-semibold">
                Top Roommate Match
              </h2>
            </div>
            <Link to="/flatmates" className="text-label-sm text-primary font-semibold">
              All Matches →
            </Link>
          </div>

          {topMatch ? (
            <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs space-y-3">
              <div className="flex items-start gap-3.5">
                <div className="relative shrink-0">
                  {topMatch.peer.avatar_url ? (
                    <img
                      src={topMatch.peer.avatar_url}
                      alt={topMatch.peer.full_name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary-fixed text-on-primary-fixed font-bold flex items-center justify-center">
                      {topMatch.peer.full_name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums">
                    {topMatch.breakdown.score}%
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-title-md font-semibold text-on-surface truncate">
                      {topMatch.peer.full_name}
                      {topMatch.peer.age ? `, ${topMatch.peer.age}` : ''}
                    </h3>
                    <span className="text-label-sm font-semibold text-primary shrink-0 tabular-nums">
                      ₹{Math.round(topMatch.prefs.budget_min / 1000)}k–₹
                      {Math.round(topMatch.prefs.budget_max / 1000)}k/mo
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant truncate">
                    {[topMatch.peer.department, topMatch.peer.college_name]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <span className="px-2.5 py-0.5 rounded-md bg-surface-container text-label-sm text-on-surface">
                      {PREFERENCE_LABELS.sleep[topMatch.prefs.sleep_schedule]}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-surface-container text-label-sm text-on-surface">
                      {PREFERENCE_LABELS.smoking[topMatch.prefs.smoking]}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-surface-container text-label-sm text-on-surface">
                      {PREFERENCE_LABELS.diet[topMatch.prefs.diet]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-surface-container flex items-center justify-between">
                <span className="text-body-sm text-outline tabular-nums">
                  {topMatch.breakdown.matchedFactorsCount}/{topMatch.breakdown.totalFactorsCount}{' '}
                  exact habit matches
                </span>
                <Link
                  to="/flatmates"
                  className="px-4 py-1.5 bg-primary text-on-primary rounded-lg text-label-md font-semibold shadow-xs flex items-center gap-1"
                >
                  <span>Connect</span>
                  <span className="material-symbols-outlined text-[16px]">person_add</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-xs space-y-2">
              <p className="text-title-md font-semibold text-on-surface">
                Discover compatible campus flatmates
              </p>
              <p className="text-body-sm text-on-surface-variant">
                Set your budget, diet, study schedule, and cleanliness preferences to rank active
                peers automatically.
              </p>
              <Link
                to="/profile?tab=preferences"
                className="inline-flex h-9 px-4 rounded-lg bg-primary text-on-primary text-label-sm font-semibold items-center gap-1 mt-1"
              >
                <span>Configure Match Preferences</span>
              </Link>
            </div>
          )}
        </section>

        {/* Recently Listed Textbooks */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-[20px]">
                auto_stories
              </span>
              <h2 className="text-headline-sm text-on-surface font-semibold">
                {profile?.department ? `${profile.department} Textbooks` : 'BookBridge Exchange'}
              </h2>
            </div>
            <Link to="/books" className="text-label-sm text-secondary font-semibold">
              Explore {bookCountAvailable} →
            </Link>
          </div>

          {recentBooks.length > 0 ? (
            <div className="space-y-2.5">
              {recentBooks.slice(0, 2).map((book) => {
                const cond = CONDITION_METADATA[book.condition] || CONDITION_METADATA.good;
                return (
                  <div
                    key={book.id}
                    className="bg-surface-container-lowest rounded-xl p-3.5 shadow-xs flex items-center gap-3.5"
                  >
                    <Link
                      to={`/books/${book.id}`}
                      className="w-16 h-22 rounded-lg bg-surface-container-high overflow-hidden shrink-0"
                    >
                      <ResilientImage
                        src={book.photo_urls?.[0]}
                        alt={book.title}
                        fallbackIcon="menu_book"
                      />
                    </Link>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant text-[11px] font-semibold">
                          {book.listing_type === 'free_donation' ? 'Free Donation' : 'Exchange'}
                        </span>
                        <span className="text-label-sm text-on-surface-variant">
                          {book.department} Sem {book.semester}
                        </span>
                      </div>
                      <Link to={`/books/${book.id}`}>
                        <h3 className="text-title-md font-semibold text-on-surface mt-1 truncate hover:text-secondary">
                          {book.title}
                        </h3>
                      </Link>
                      <p className="text-body-sm text-on-surface-variant line-clamp-1">
                        {book.author}
                        {book.edition ? ` • ${book.edition}` : ''}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((bar) => (
                            <span
                              key={bar}
                              className={`w-3.5 h-1.5 rounded-full ${
                                bar <= cond.score
                                  ? 'bg-primary'
                                  : 'bg-surface-container-highest'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] text-outline">{cond.label}</span>
                      </div>
                    </div>

                    <Link
                      to={`/books/${book.id}`}
                      className="shrink-0 px-3.5 py-1.5 bg-secondary text-on-secondary rounded-lg text-label-md font-semibold shadow-xs"
                    >
                      Request
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-xs space-y-2">
              <p className="text-title-md font-semibold text-on-surface">
                Pass forward your semester textbooks
              </p>
              <p className="text-body-sm text-on-surface-variant">
                Donate previous-semester syllabus copies at ₹0 or swap with campus peers.
              </p>
              <Link
                to="/books/new"
                className="inline-flex h-9 px-4 rounded-lg bg-secondary text-on-secondary text-label-sm font-semibold items-center gap-1 mt-1"
              >
                <span>Donate a Textbook</span>
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
