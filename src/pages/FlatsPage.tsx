import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase';
import { canDisplayCollegeVerifiedBadge } from '../lib/verification';
import type { AccommodationListing, RoomType } from '../types/database';
import { ResilientImage } from '../components/ResilientImage';
import { SafetyBanner } from '../components/SafetyBanner';

const PAGE_SIZE = 12;

const CITIES = [
  'All Cities',
  'Chennai',
  'Bengaluru',
  'Mumbai',
  'Delhi',
  'Hyderabad',
  'Pune',
  'Coimbatore',
  'Trichy',
];

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  private_room: 'Private Room',
  shared_room: 'Shared Room',
  entire_flat: 'Entire Flat',
  studio_1rk: 'Studio / 1RK',
};

const GENDER_PREF_LABELS: Record<AccommodationListing['gender_preference'], string> = {
  any: 'Male/Female Friendly',
  male_only: 'Male Students Only',
  female_only: 'Female Students Only',
};

const AMENITY_ICONS: Record<string, string> = {
  'High-speed Wi-Fi': 'wifi',
  'Wi-Fi Included': 'wifi',
  'Attached Bath': 'shower',
  'Cook Available': 'skillet',
  AC: 'ac_unit',
  'Washing Machine': 'local_laundry_service',
  'Bike Parking': 'two_wheeler',
  'Fully Furnished': 'chair',
  '24/7 Power Backup': 'bolt',
  'Security Guard': 'security',
  'Study Desk': 'desk',
  'RO Water': 'water_drop',
};

const COMMON_AMENITIES = [
  'High-speed Wi-Fi',
  'Attached Bath',
  'Cook Available',
  'AC',
  'Washing Machine',
  'Bike Parking',
  'Fully Furnished',
  '24/7 Power Backup',
];

type SortOption = 'newest' | 'rent_asc' | 'rent_desc' | 'move_in' | 'distance_asc';

export function FlatsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, savedFlatIds, toggleSaveFlat } = useAuth();
  const { showToast } = useToast();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [city, setCity] = useState(searchParams.get('city') || 'All Cities');
  const [maxRent, setMaxRent] = useState<string>(searchParams.get('maxRent') || '');
  const [roomType, setRoomType] = useState<'all' | RoomType>(
    (searchParams.get('room') as RoomType) || 'all'
  );
  const [maxDistanceKm, setMaxDistanceKm] = useState<string>('');
  const [selectedAmenity, setSelectedAmenity] = useState<string>('');
  const [moveInBefore, setMoveInBefore] = useState<string>('');
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState<boolean>(false);
  const [page, setPage] = useState<number>(0);

  const [flats, setFlats] = useState<AccommodationListing[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (city !== 'All Cities') count += 1;
    if (maxRent) count += 1;
    if (roomType !== 'all') count += 1;
    if (maxDistanceKm) count += 1;
    if (selectedAmenity) count += 1;
    if (moveInBefore) count += 1;
    if (verifiedOnly) count += 1;
    return count;
  }, [city, maxDistanceKm, maxRent, moveInBefore, roomType, selectedAmenity, verifiedOnly]);

  const fetchFlats = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ownerRelation = verifiedOnly
        ? 'owner:profiles!accommodation_listings_owner_id_fkey!inner(*)'
        : 'owner:profiles!accommodation_listings_owner_id_fkey(*)';

      let builder = supabase
        .from('accommodation_listings')
        .select(`*, ${ownerRelation}, images:accommodation_images(*)`, { count: 'exact' })
        .eq('status', 'published');

      if (verifiedOnly) {
        builder = builder.eq('owner.college_verified', true);
      }

      if (city !== 'All Cities') {
        builder = builder.ilike('city', city);
      }

      if (maxRent && Number(maxRent) > 0) {
        builder = builder.lte('rent_monthly', Number(maxRent));
      }

      if (roomType !== 'all') {
        builder = builder.eq('room_type', roomType);
      }

      if (maxDistanceKm && Number(maxDistanceKm) > 0) {
        builder = builder.not('distance_km', 'is', null).lte('distance_km', Number(maxDistanceKm));
      }

      if (selectedAmenity) {
        builder = builder.contains('amenities', [selectedAmenity]);
      }

      if (moveInBefore) {
        builder = builder.lte('available_from', moveInBefore);
      }

      const trimmed = query.trim();
      if (trimmed) {
        builder = builder.or(
          `title.ilike.%${trimmed}%,locality.ilike.%${trimmed}%,nearby_college.ilike.%${trimmed}%,city.ilike.%${trimmed}%,description.ilike.%${trimmed}%`
        );
      }

      if (sortBy === 'rent_asc') {
        builder = builder.order('rent_monthly', { ascending: true });
      } else if (sortBy === 'rent_desc') {
        builder = builder.order('rent_monthly', { ascending: false });
      } else if (sortBy === 'move_in') {
        builder = builder.order('available_from', { ascending: true });
      } else if (sortBy === 'distance_asc') {
        builder = builder.order('distance_km', { ascending: true, nullsFirst: false });
      } else {
        builder = builder.order('created_at', { ascending: false });
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error: dbErr } = await builder.range(from, to);

      if (dbErr) throw new Error(formatSupabaseError(dbErr));

      const normalized = ((data as AccommodationListing[] | null) ?? []).map((item) => ({
        ...item,
        images: [...(item.images || [])].sort((a, b) => a.display_order - b.display_order),
      }));

      setFlats(normalized);
      setTotalCount(count ?? 0);
    } catch (err) {
      setError(formatSupabaseError(err, 'Unable to load accommodation listings.'));
    } finally {
      setLoading(false);
    }
  }, [
    city,
    maxDistanceKm,
    maxRent,
    moveInBefore,
    page,
    query,
    roomType,
    selectedAmenity,
    sortBy,
    verifiedOnly,
  ]);

  useEffect(() => {
    fetchFlats();
  }, [fetchFlats]);

  const syncUrlParams = (nextCity = city, nextQuery = query) => {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    if (nextCity !== 'All Cities') params.set('city', nextCity);
    if (maxRent) params.set('maxRent', maxRent);
    if (roomType !== 'all') params.set('room', roomType);
    setSearchParams(params, { replace: true });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    syncUrlParams();
  };

  const handleUseMyCampusCity = () => {
    if (profile?.city) {
      setCity(profile.city);
      setPage(0);
      showToast({
        variant: 'info',
        title: `Filtered to ${profile.city}`,
        description: profile.college_name ? `Showing stays near ${profile.college_name}` : undefined,
      });
    } else {
      navigate('/profile');
    }
  };

  const handleToggleSave = async (flatId: string) => {
    if (!user) {
      navigate('/auth?redirect=/flats');
      return;
    }
    try {
      const saved = await toggleSaveFlat(flatId);
      showToast({
        variant: 'info',
        title: saved ? 'Saved to Shortlist' : 'Removed from Shortlist',
      });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Could not update saved listing',
        description: formatSupabaseError(err),
      });
    }
  };

  const resetAllFilters = () => {
    setQuery('');
    setCity('All Cities');
    setMaxRent('');
    setRoomType('all');
    setMaxDistanceKm('');
    setSelectedAmenity('');
    setMoveInBefore('');
    setVerifiedOnly(false);
    setSortBy('newest');
    setPage(0);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const formatAvailabilityLabel = (isoDate: string) => {
    const parsed = Date.parse(isoDate);
    if (Number.isNaN(parsed)) return 'Available soon';
    if (parsed <= Date.now()) return 'Immediate Move-in';
    return `Available from ${new Date(parsed).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    })}`;
  };

  return (
    <div className="flex flex-col w-full px-4 lg:px-8 pt-3 pb-16 space-y-4">
      {/* Stitch Page Header & Post CTA */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-headline-lg-mobile lg:text-headline-lg text-on-surface font-bold tracking-tight">
            Find a Flat &amp; Room
          </h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Student-listed rooms and shared flats near university campuses with zero brokerage
          </p>
        </div>

        <Link
          to="/flats/new"
          className="h-11 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold shadow-xs hover:bg-primary-container transition-colors flex items-center justify-center gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[19px]">add_home</span>
          <span>Post a Room</span>
        </Link>
      </section>

      {/* Search Bar & Scrollable Stitch Filter Chips */}
      <section className="space-y-2.5">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-primary">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search city, locality, or college (e.g. IIT Madras, Anna Univ)..."
            className="w-full h-11 pl-10 pr-11 bg-surface-container-lowest rounded-xl text-body-sm text-on-surface placeholder:text-outline shadow-xs focus:outline-none focus:ring-2 focus:ring-primary transition-all"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <button
              type="button"
              onClick={handleUseMyCampusCity}
              title="Filter by my profile city"
              aria-label="Filter by my campus city"
              className="text-outline hover:text-primary transition-colors flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[20px]">my_location</span>
            </button>
          </div>
        </form>

        {/* Scrollable Filter Chips preserving Stitch layout */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <select
            aria-label="Filter by city"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setPage(0);
            }}
            className={`shrink-0 h-9 px-3.5 rounded-full text-label-sm shadow-xs transition-colors cursor-pointer ${
              city !== 'All Cities'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container-lowest text-on-surface'
            }`}
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c === 'All Cities' ? 'All Cities' : c}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setMaxRent((prev) => (prev === '8000' ? '' : '8000'));
              setPage(0);
            }}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              maxRent === '8000'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            Rent: Under ₹8,000
          </button>

          <button
            type="button"
            onClick={() => {
              setRoomType((prev) => (prev === 'private_room' ? 'all' : 'private_room'));
              setPage(0);
            }}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              roomType === 'private_room'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            Room: Private Room
          </button>

          <button
            type="button"
            onClick={() => {
              setMaxDistanceKm((prev) => (prev === '2' ? '' : '2'));
              setPage(0);
            }}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              maxDistanceKm === '2'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            &le; 2 km from Campus
          </button>

          <button
            type="button"
            onClick={() => {
              setVerifiedOnly((v) => !v);
              setPage(0);
            }}
            className={`flex items-center gap-1 shrink-0 px-3.5 py-1.5 rounded-full text-label-sm shadow-xs transition-colors ${
              verifiedOnly
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container-lowest text-primary hover:bg-surface-container-low'
            }`}
          >
            <span>Verified Owner Only</span>
            <span
              className={`material-symbols-outlined text-[16px] material-icon-filled ${
                verifiedOnly ? 'text-on-primary' : 'text-primary'
              }`}
            >
              check_circle
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterDrawerOpen(true)}
            className="flex items-center gap-1.5 shrink-0 px-3.5 py-1.5 rounded-full bg-surface-container text-on-surface text-label-sm shadow-xs hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="shrink-0 px-3 py-1.5 rounded-full text-label-sm text-error hover:bg-error-container/30 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </section>

      {/* Feed Toolbar / Sort Controls */}
      <section className="flex items-center justify-between py-1">
        <span className="text-label-sm text-on-surface font-semibold tabular-nums">
          {totalCount} {totalCount === 1 ? 'Student Stay' : 'Student Stays'} Found
        </span>

        <div className="flex items-center gap-2">
          <label htmlFor="flat-sort" className="text-label-sm text-on-surface-variant hidden sm:inline">
            Sort by:
          </label>
          <select
            id="flat-sort"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortOption);
              setPage(0);
            }}
            className="h-9 px-3 rounded-lg bg-surface-container-lowest text-label-sm text-on-surface shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="newest">Newest Listed</option>
            <option value="rent_asc">Rent: Low to High</option>
            <option value="rent_desc">Rent: High to Low</option>
            <option value="move_in">Earliest Move-in</option>
            <option value="distance_asc">Reported Distance</option>
          </select>
        </div>
      </section>

      <SafetyBanner mode="housing" />

      {/* Accommodation Listing Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="h-96 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-surface-container-lowest rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <p className="text-title-md text-error font-semibold">Unable to load flats</p>
          <p className="text-body-sm text-on-surface-variant">{error}</p>
          <button
            type="button"
            onClick={fetchFlats}
            className="h-10 px-4 rounded-xl bg-primary text-on-primary text-label-md font-semibold"
          >
            Retry
          </button>
        </div>
      ) : flats.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[24px]">apartment</span>
          </div>
          <h2 className="text-title-md font-semibold text-on-surface">
            No matching student stays yet
          </h2>
          <p className="text-body-sm text-on-surface-variant max-w-md mx-auto">
            {isSupabaseConfigured
              ? 'Adjust your budget or locality filters, or publish a vacant room in your flat for verified campus peers.'
              : 'Connect your Supabase project credentials in Secrets to browse and publish real FlatMate accommodation listings.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="h-10 px-4 rounded-xl bg-surface-container text-on-surface text-label-md font-semibold"
              >
                Reset Filters
              </button>
            )}
            <Link
              to="/flats/new"
              className="h-10 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Post a Room</span>
            </Link>
          </div>
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {flats.map((flat) => {
            const coverImage = flat.images?.[0]?.public_url || null;
            const photoCount = flat.images?.length || 0;
            const isSaved = savedFlatIds.has(flat.id);
            const ownerVerified = canDisplayCollegeVerifiedBadge(flat.owner);
            const availabilityText = formatAvailabilityLabel(flat.available_from);
            const isImmediate = availabilityText === 'Immediate Move-in';

            return (
              <article
                key={flat.id}
                className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* 16:10 Media Frame matching Stitch */}
                  <div className="relative w-full aspect-[16/10] bg-surface-container overflow-hidden">
                    <Link to={`/flats/${flat.id}`} className="block w-full h-full">
                      <ResilientImage
                        src={coverImage}
                        alt={flat.title}
                        fallbackIcon="apartment"
                        fallbackLabel={`${flat.locality}, ${flat.city}`}
                      />
                    </Link>

                    {/* Top Overlay Badges & Favorite Button */}
                    <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
                      <div className="flex items-center gap-1.5">
                        {ownerVerified && (
                          <span className="bg-primary/95 text-on-primary text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-xs backdrop-blur-md flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] material-icon-filled">
                              verified
                            </span>
                            <span>College Verified Host</span>
                          </span>
                        )}
                        <span className="bg-secondary text-on-secondary text-[11px] font-medium px-2 py-1 rounded-full shadow-xs">
                          No Brokerage
                        </span>
                      </div>

                      <button
                        type="button"
                        aria-label={isSaved ? 'Remove from saved flats' : 'Save this listing'}
                        onClick={() => handleToggleSave(flat.id)}
                        className={`pointer-events-auto w-8 h-8 rounded-full bg-surface-container-lowest/90 backdrop-blur-md shadow-xs flex items-center justify-center transition-transform active:scale-90 ${
                          isSaved ? 'text-error' : 'text-on-surface hover:text-error'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[18px] ${
                            isSaved ? 'material-icon-filled' : ''
                          }`}
                        >
                          favorite
                        </span>
                      </button>
                    </div>

                    {/* Photo Count Micro Indicator */}
                    {photoCount > 0 && (
                      <div className="absolute bottom-2.5 right-3 bg-inverse-surface/80 text-inverse-on-surface px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 backdrop-blur-xs tabular-nums">
                        <span className="material-symbols-outlined text-[12px]">photo_camera</span>
                        <span>1/{photoCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Body matching Stitch */}
                  <div className="p-3.5 flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-headline-md text-primary font-bold tracking-tight tabular-nums">
                          ₹{flat.rent_monthly.toLocaleString('en-IN')}
                        </span>
                        <span className="text-body-sm text-on-surface-variant font-medium">
                          / month
                        </span>
                      </div>
                      <span className="text-label-sm text-outline tabular-nums">
                        Deposit: ₹{flat.deposit_amount.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <Link to={`/flats/${flat.id}`}>
                        <h2 className="text-title-md text-on-surface font-semibold line-clamp-1 hover:text-primary transition-colors">
                          {flat.title}
                        </h2>
                      </Link>
                      <span className="text-body-sm text-on-surface-variant line-clamp-1">
                        {ROOM_TYPE_LABELS[flat.room_type]} • {GENDER_PREF_LABELS[flat.gender_preference]} •{' '}
                        {flat.locality}
                      </span>
                    </div>

                    {/* Truthful Campus Proximity Row (only renders user-submitted fields, never fabricated) */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface">
                      <span className="material-symbols-outlined text-primary text-[17px] shrink-0">
                        school
                      </span>
                      <span className="text-body-sm font-medium line-clamp-1">
                        {flat.distance_km !== null && flat.distance_km !== undefined
                          ? `${flat.distance_km} km from ${flat.nearby_college}`
                          : `Near ${flat.nearby_college}`}
                        {flat.transport_note ? ` • ${flat.transport_note}` : ''}
                      </span>
                    </div>

                    {/* Amenities Row */}
                    {flat.amenities && flat.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {flat.amenities.slice(0, 4).map((amenity) => (
                          <span
                            key={amenity}
                            className="text-[11px] font-medium px-2 py-1 rounded-md bg-surface-container-low text-on-surface-variant flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[13px] text-primary">
                              {AMENITY_ICONS[amenity] || 'check_circle'}
                            </span>
                            <span>{amenity}</span>
                          </span>
                        ))}
                        {flat.amenities.length > 4 && (
                          <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-surface-container-low text-outline">
                            +{flat.amenities.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Availability & View Details CTA */}
                <div className="px-3.5 pb-3.5 pt-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-on-surface-variant min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-secondary shrink-0">
                      calendar_today
                    </span>
                    <span
                      className={`text-label-sm truncate ${
                        isImmediate ? 'text-primary font-semibold' : ''
                      }`}
                    >
                      {availabilityText} ({flat.spots_available}/{flat.spots_total} spot
                      {flat.spots_total > 1 ? 's' : ''})
                    </span>
                  </div>

                  <Link
                    to={`/flats/${flat.id}`}
                    className="h-9 px-4 rounded-xl bg-primary text-on-primary text-label-md font-semibold shadow-xs hover:bg-primary-container transition-all flex items-center gap-1 shrink-0"
                  >
                    <span>View Details</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="h-10 px-4 rounded-xl bg-surface-container-lowest text-label-sm font-semibold shadow-xs disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-body-sm text-on-surface-variant tabular-nums">
            Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
          </span>
          <button
            type="button"
            disabled={(page + 1) * PAGE_SIZE >= totalCount}
            onClick={() => setPage((p) => p + 1)}
            className="h-10 px-4 rounded-xl bg-surface-container-lowest text-label-sm font-semibold shadow-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Stitch Zero Brokerage Guarantee Box */}
      <div className="bg-surface-container-high rounded-xl p-4 flex items-center gap-3 shadow-xs">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          <span className="material-symbols-outlined text-[24px]">verified_user</span>
        </div>
        <div className="flex flex-col">
          <span className="text-title-md font-semibold text-on-surface">
            Zero Brokerage Student Stays
          </span>
          <span className="text-body-sm text-on-surface-variant">
            Listings on CampusCircle are posted directly by students and flatmates—report any broker
            fee request immediately for moderation removal.
          </span>
        </div>
      </div>

      {/* Stitch Sticky Floating Filter Action Bar */}
      <div className="sticky bottom-18 lg:bottom-4 inset-x-0 z-30 flex justify-center pointer-events-none">
        <button
          type="button"
          onClick={() => setFilterDrawerOpen(true)}
          className="pointer-events-auto h-12 px-5 rounded-full bg-on-surface text-surface-bright shadow-xl flex items-center gap-2 active:scale-95 hover:bg-inverse-surface transition-all"
        >
          <span className="material-symbols-outlined text-primary-fixed text-[20px]">tune</span>
          <span className="text-label-md font-semibold tracking-wide">
            Filter by Budget, College &amp; Amenities
          </span>
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center ml-0.5 tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Interactive Filter Modal / Drawer */}
      {filterDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filter accommodation listings"
          className="fixed inset-0 z-[65] bg-inverse-surface/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-lg bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-title-md font-semibold text-on-surface">
                Filter Student Accommodations
              </h2>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setFilterDrawerOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-label-sm text-on-surface mb-1">City</label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                >
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-label-sm text-on-surface mb-1">
                  Maximum Monthly Rent (₹)
                </label>
                <select
                  value={maxRent}
                  onChange={(e) => setMaxRent(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                >
                  <option value="">Any Budget</option>
                  <option value="5000">Up to ₹5,000 / mo</option>
                  <option value="8000">Up to ₹8,000 / mo</option>
                  <option value="12000">Up to ₹12,000 / mo</option>
                  <option value="18000">Up to ₹18,000 / mo</option>
                  <option value="25000">Up to ₹25,000 / mo</option>
                </select>
              </div>

              <div>
                <label className="block text-label-sm text-on-surface mb-1">Room Type</label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value as 'all' | RoomType)}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                >
                  <option value="all">All Room Types</option>
                  <option value="private_room">Private Room</option>
                  <option value="shared_room">Shared Room</option>
                  <option value="entire_flat">Entire Flat</option>
                  <option value="studio_1rk">Studio / 1RK</option>
                </select>
              </div>

              <div>
                <label className="block text-label-sm text-on-surface mb-1">
                  Available On or Before
                </label>
                <input
                  type="date"
                  value={moveInBefore}
                  onChange={(e) => setMoveInBefore(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                />
              </div>
            </div>

            <div>
              <span className="block text-label-sm text-on-surface mb-1.5">Must-Have Amenity</span>
              <div className="flex flex-wrap gap-2">
                {COMMON_AMENITIES.map((item) => {
                  const active = selectedAmenity === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSelectedAmenity(active ? '' : item)}
                      className={`px-3 py-1.5 rounded-lg text-label-sm transition-colors ${
                        active
                          ? 'bg-primary text-on-primary font-semibold'
                          : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-low cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-body-sm text-on-surface">
                Only show rooms listed by College ID / Institutional Email Verified students
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={resetAllFilters}
                className="h-11 px-4 rounded-xl bg-surface-container text-on-surface text-label-md font-semibold"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setPage(0);
                  syncUrlParams();
                  setFilterDrawerOpen(false);
                }}
                className="flex-1 h-11 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
