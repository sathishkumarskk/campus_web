import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ResilientImage } from '../components/ResilientImage';

const STUDENT_HUBS = [
  {
    city: 'Bengaluru',
    badge: 'Active Hub',
    areas: 'Koramangala, Electronic City, HSR',
    colleges: 'Christ Univ, IISc, PESIT',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBRvadvagYD6igyL_-cFBxYI2YFtTp_DLIbm3hR2v6p1TMKkwBRMksFJ_jJczcp_BNSj3e0mQcWqXFgoh0BOHIZTfuxqx8NbUK-8-niqBJ94tdCMm6g9IQ_2SqNiFmZOr5JLRAnuxOST1ZRzEe-13IxO2lLbTl3WMpyndoKYQoUyPzV7TfI8NjOKXsE-bi6XcUshyEf7yDclhmuZGZs9XaG3AbcMzwKoyp_BFZi7zaSPBbNDABsecEw',
  },
  {
    city: 'Chennai',
    badge: 'Popular',
    areas: 'Velachery, Guindy, OMR, Adyar',
    colleges: 'Anna Univ, IITM, SRM',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBRLN8MTg9kCMn2uYDrZMO1yTibAQEEXPDQmauZeAFDj_9O68Euw8A8c5JWRTC6UTQfjUjNZFhhH4_qHi-1Up1kjZjSPdSQZJidb0eiiqTwYfOrVArZKzq9lWY2FNHOoKG_DumUud9_lqtk2W2trhnoZI7RjHA9-dd0pS3V35mcvxqH-lDTYnjT2hDVjW_Cc8_y-ohsG28facW0Ztw8IknX7nD4nfQU0a25_9VFDlNYq73_zNWPXRsa',
  },
  {
    city: 'Hyderabad',
    badge: 'Fast Growing',
    areas: 'Gachibowli, Madhapur, Hitec City',
    colleges: 'UoH, BITS Hyd, IIIT-H',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDP1Qg_GeEqKXdEb6AScmMnleOmLSJUG_SOIyxuR8W_8Bq9NgzCiyAmeJwsh2DoafQQr9VVTN6iKhnlF0A0tHUrtJezfXQgoSr15gZWwVUvKFkZBSCCia5mHHFn0HNfFJITqS6NSjzPKIupOOz_z8ajVS9NsJ0unSJaw-evEKs0z2Af6aTyUql1iLNyiCuW4oQGe--GpI74nU04mZjBjsM4vMc3OnRhwR9S-dA07wsHX0iOLC0eHzdR',
  },
  {
    city: 'Coimbatore',
    badge: 'High Trust',
    areas: 'Peelamedu, Gandhipuram, Saravanampatti',
    colleges: 'PSG Tech, CIT, Kumaraguru',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCr8HQNIWLZmaVQ64-Ri5w_i2vAXx3BzuN0kybtmgVP8RX0NB2idK9ddqY7i40daTLzJ4_FEJPPiLzVMPyD8Oq8xEwbJ6HOJdo4oCciqi0rlX6VhALn9G2JHcoKAw1dHUQQY2bx05agQsurfHwQN8il2w-msB2digbxh49AGSUAbbmKpYbkQfY48VX_PcdOGBKLYcUk02ZyaG2dyqsHp-DHXOPu2P0I3MKEnARMiPfPz6HXsnJ15EF9',
  },
];

export function HomePage() {
  const { user, isConfigured, schemaStatus } = useAuth();
  const navigate = useNavigate();
  const [liveCounts, setLiveCounts] = useState<{
    flats: number;
    books: number;
    byCity: Record<string, number>;
  } | null>(null);
  const [showPostDrawer, setShowPostDrawer] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !isConfigured || schemaStatus !== 'ready') return;
    let active = true;

    async function loadLiveStats() {
      const [flatsRes, booksRes] = await Promise.all([
        supabase
          .from('accommodation_listings')
          .select('city', { count: 'exact' })
          .eq('status', 'published'),
        supabase
          .from('book_listings')
          .select('id', { count: 'exact', head: true })
          .in('availability_status', ['available', 'reserved', 'completed']),
      ]);

      if (!active || flatsRes.error || booksRes.error) return;
      const byCity: Record<string, number> = {};
      for (const row of (flatsRes.data as { city: string }[] | null) ?? []) {
        const key = row.city?.trim() || '';
        if (key) byCity[key] = (byCity[key] || 0) + 1;
      }
      setLiveCounts({
        flats: flatsRes.count ?? 0,
        books: booksRes.count ?? 0,
        byCity,
      });
    }

    loadLiveStats();
    return () => {
      active = false;
    };
  }, [isConfigured, schemaStatus]);

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section (Preserves Google Stitch Image_2_1af4e90a.html) */}
      <section className="relative px-4 lg:px-8 pt-4 lg:pt-10 pb-6 lg:pb-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 overflow-hidden">
        <div className="absolute -top-12 -right-16 w-64 h-64 rounded-full bg-primary-fixed/30 blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-48 -left-20 w-60 h-60 rounded-full bg-secondary-fixed/40 blur-3xl pointer-events-none -z-10" />

        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="inline-flex self-start items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface shadow-xs animate-badge-pulse">
            <span className="text-tertiary font-bold text-sm">⚡</span>
            <span className="text-label-sm text-on-surface tracking-normal">
              Built for University Campuses Across India
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <h1 className="text-headline-lg-mobile lg:text-display text-on-surface tracking-tight font-bold">
              Find Your Place.
              <br />
              Find Your People.
              <br />
              <span className="text-primary font-bold">Share Your Knowledge.</span>
            </h1>
            <p className="text-body-md lg:text-body-lg text-on-surface-variant leading-relaxed">
              Find affordable student flats near campus with zero brokerage, meet compatible
              flatmates with matched living habits, and access academic textbooks for free.
            </p>
          </div>

          {/* Dual Action CTAs */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <a
              href="#services"
              className="sm:w-auto w-full h-12 px-6 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-transform"
            >
              <span className="text-label-md font-semibold">Explore CampusCircle</span>
              <span className="material-symbols-outlined text-[19px]">arrow_forward</span>
            </a>
            <button
              type="button"
              onClick={() => navigate(user ? '/profile#verification' : '/auth?mode=signup')}
              className="sm:w-auto w-full h-12 px-6 rounded-xl bg-surface-container-low text-primary flex items-center justify-center gap-2 hover:bg-surface-container transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-primary text-[20px]">badge</span>
              <span className="text-label-md font-semibold">
                {user ? 'Verify College ID' : 'Join with College ID'}
              </span>
            </button>
          </div>

          {/* Campus Community Stack */}
          <div className="flex items-center gap-3.5 pt-2 pb-1">
            <div className="flex -space-x-2.5 overflow-hidden py-1 pl-1">
              <div className="relative w-9 h-9 rounded-full shadow-xs bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant text-[11px] font-bold">
                AU
              </div>
              <div className="relative w-9 h-9 rounded-full shadow-xs bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed-variant text-[11px] font-bold">
                IIT
              </div>
              <div className="relative w-9 h-9 rounded-full shadow-xs bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed text-[11px] font-bold">
                CU
              </div>
              <div className="relative w-9 h-9 rounded-full shadow-xs bg-primary-container flex items-center justify-center text-on-primary text-[11px] font-bold">
                BH
              </div>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-label-sm font-semibold text-on-surface">
                Zero Brokerage • Zero Textbook Cost
              </span>
              <p className="text-body-sm text-on-surface-variant truncate">
                Anna Univ • IIT Madras • Christ • BITS • PSG
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Highlight Summary Card */}
        <div className="hidden lg:flex flex-col gap-3 w-96 bg-surface-container-lowest rounded-2xl p-6 shadow-md">
          <span className="text-label-sm text-primary uppercase tracking-wider font-semibold">
            Unified Student Platform
          </span>
          <h2 className="text-headline-sm text-on-surface">
            One verified profile across housing and academics
          </h2>
          <p className="text-body-sm text-on-surface-variant leading-relaxed">
            Connect your college email or ID once to message flat owners, compare deterministic
            flatmate compatibility scores, and reserve free semester textbooks.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Link
              to="/flats"
              className="p-3 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">apartment</span>
              <p className="text-label-md font-semibold text-on-surface mt-1">FlatMate</p>
              <p className="text-body-sm text-on-surface-variant tabular-nums">
                {liveCounts ? `${liveCounts.flats} live rooms` : 'Browse rooms'}
              </p>
            </Link>
            <Link
              to="/books"
              className="p-3 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-secondary text-[22px]">
                menu_book
              </span>
              <p className="text-label-md font-semibold text-on-surface mt-1">BookBridge</p>
              <p className="text-body-sm text-on-surface-variant tabular-nums">
                {liveCounts ? `${liveCounts.books} listed books` : 'Free books'}
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* Flagship Services (Stitch Two Pillars) */}
      <section id="services" className="px-4 lg:px-8 py-4 flex flex-col gap-4">
        <div className="flex flex-col">
          <span className="text-label-sm text-primary uppercase tracking-wider font-semibold">
            Our Flagship Pillars
          </span>
          <h2 className="text-headline-sm lg:text-headline-md text-on-surface">
            Built Exclusively for Campus Life
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card 1: FlatMate Service Card */}
          <div className="w-full bg-surface-container-lowest rounded-xl shadow-md p-4 lg:p-5 flex flex-col gap-3.5 relative overflow-hidden">
            <div className="relative w-full h-40 lg:h-48 rounded-lg overflow-hidden bg-surface-container">
              <ResilientImage
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAI6Fm629GtBjEAfqZyfWoVkGc6JoyKufvBagsh_wJp4AKUu3RqwVGnEe4-gTbbMaB3xYYCBSsHUdRQ4ozl5W8ryykq7MI2g77GxverCIgVKzr3EGTb1JsCR1ZUP3Hd-7LvL5UPRCaqpVZdGVuzBQcbp6sAnOvN8kDd9us5yR46jWxpP5VLraHubBi4XnuTuFfdKC565EbbEv-586ep6Ck5uhj6-wz9RTj1yU905WSnIs8h90opvcLO"
                alt="Sunny student apartment living room with wooden study desk and plants"
                fallbackIcon="apartment"
                fallbackLabel="Student Housing & Living"
              />
              <div className="absolute top-2.5 left-2.5">
                <span className="px-2.5 py-1 rounded-full bg-primary text-on-primary text-[11px] font-semibold tracking-wide uppercase shadow-xs">
                  Housing &amp; Living
                </span>
              </div>
              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-surface/90 backdrop-blur-xs text-on-surface text-[10px] font-semibold flex items-center gap-1 shadow-xs">
                <span className="material-symbols-outlined text-[13px] text-primary material-icon-filled">
                  verified
                </span>
                Student PGs &amp; Flats
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-headline-sm text-on-surface leading-tight">
                Find Your Room &amp; Flatmates
              </h3>
              <p className="text-body-md text-on-surface-variant">
                Bachelor-friendly rooms, zero brokerage, transparent rent splits, and deterministic
                lifestyle matching with college peers.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1 flex-1">
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low text-on-surface">
                <div className="w-7 h-7 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant shrink-0">
                  <span className="material-symbols-outlined text-[17px]">percent</span>
                </div>
                <span className="text-label-md font-medium">
                  0% Brokerage • Direct Student &amp; Owner Listings
                </span>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low text-on-surface">
                <div className="w-7 h-7 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant shrink-0">
                  <span className="material-symbols-outlined text-[17px]">near_me</span>
                </div>
                <span className="text-label-md font-medium">
                  City, College, Budget &amp; Amenity Filters
                </span>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low text-on-surface">
                <div className="w-7 h-7 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant shrink-0">
                  <span className="material-symbols-outlined text-[17px]">diversity_3</span>
                </div>
                <span className="text-label-md font-medium">
                  Lifestyle Compatibility Match (Diet, Sleep, Study)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <Link
                to="/flats"
                className="w-full h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center gap-2 text-label-md font-semibold active:opacity-90 shadow-xs"
              >
                <span>Explore Flats</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
              <Link
                to="/flatmates"
                className="w-full h-11 rounded-xl bg-surface-container text-on-surface flex items-center justify-center gap-2 text-label-md font-semibold hover:bg-surface-container-high"
              >
                <span>Match Flatmates</span>
                <span className="material-symbols-outlined text-[18px]">group</span>
              </Link>
            </div>
          </div>

          {/* Card 2: BookBridge Service Card */}
          <div className="w-full bg-surface-container-lowest rounded-xl shadow-md p-4 lg:p-5 flex flex-col gap-3.5 relative overflow-hidden">
            <div className="relative w-full h-40 lg:h-48 rounded-lg overflow-hidden bg-surface-container">
              <ResilientImage
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAWUQ0jf6pY-UDC0EhXNEi71BETd6e6lozYVhAiSJ_u1yBmtz-Q0i4qA5AfPBTEvD16n-yrDtUP4e-vxS54BvHqZH0pRV8n-YNI0rSDXd_thfTpAKC3xJ87uEDf77EPs0BCCYPdc6t0YOsgkGAHBBbfxPvlLW14Eet2RR4qzzP_WJsPlKgIpMkDJk5v7qG-cBrFpHpAW1oCe02c2oe81FILfSed33kHnbC9gfS41CQYae86irDhynyR"
                alt="University engineering textbooks stacked on library wooden desk"
                fallbackIcon="menu_book"
                fallbackLabel="Academic Circularity"
              />
              <div className="absolute top-2.5 left-2.5">
                <span className="px-2.5 py-1 rounded-full bg-secondary text-on-secondary text-[11px] font-semibold tracking-wide uppercase shadow-xs">
                  Academic Circularity
                </span>
              </div>
              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-surface/90 backdrop-blur-xs text-secondary text-[10px] font-semibold flex items-center gap-1 shadow-xs">
                <span className="material-symbols-outlined text-[13px] material-icon-filled">
                  volunteer_activism
                </span>
                100% Free Sharing
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-headline-sm text-on-surface leading-tight">
                Books Deserve a Second Chapter
              </h3>
              <p className="text-body-md text-on-surface-variant">
                Give old semester textbooks a new life or request reference materials from seniors
                across departments completely free.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1 flex-1">
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low text-on-surface">
                <div className="w-7 h-7 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed-variant shrink-0">
                  <span className="material-symbols-outlined text-[17px]">swap_horiz</span>
                </div>
                <span className="text-label-md font-medium">
                  Free Donations &amp; Direct Campus Swaps
                </span>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low text-on-surface">
                <div className="w-7 h-7 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed-variant shrink-0">
                  <span className="material-symbols-outlined text-[17px]">filter_list</span>
                </div>
                <span className="text-label-md font-medium">
                  Semester, Branch &amp; Course Code Filter
                </span>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low text-on-surface">
                <div className="w-7 h-7 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed-variant shrink-0">
                  <span className="material-symbols-outlined text-[17px]">pin_drop</span>
                </div>
                <span className="text-label-md font-medium">
                  Campus Safe Pickup Spots (Hostel • Library • Canteen)
                </span>
              </div>
            </div>

            <Link
              to="/books"
              className="mt-1 w-full h-11 rounded-xl bg-secondary text-on-secondary flex items-center justify-center gap-2 text-label-md font-semibold active:opacity-90 shadow-xs"
            >
              <span>Browse Textbook Exchange</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      </section>

      {/* City Discovery Section */}
      <section className="py-4 flex flex-col gap-3">
        <div className="px-4 lg:px-8 flex flex-col gap-0.5">
          <span className="text-label-sm text-primary uppercase tracking-wider font-semibold">
            Campus Geographies
          </span>
          <h2 className="text-headline-sm text-on-surface">Popular Student Hubs</h2>
          <p className="text-body-sm text-on-surface-variant">
            Explore student accommodation and textbook listings near major university clusters
          </p>
        </div>

        <div className="flex lg:grid lg:grid-cols-4 gap-3.5 overflow-x-auto px-4 lg:px-8 pb-2 hide-scrollbar snap-x">
          {STUDENT_HUBS.map((hub) => {
            const liveCount = liveCounts?.byCity[hub.city];
            return (
              <Link
                key={hub.city}
                to={`/flats?city=${encodeURIComponent(hub.city)}`}
                className="min-w-[260px] lg:min-w-0 snap-center bg-surface-container-lowest rounded-xl p-3.5 shadow-xs hover:shadow-md transition-shadow flex flex-col gap-3"
              >
                <div className="relative w-full h-28 rounded-lg overflow-hidden bg-surface-container">
                  <ResilientImage
                    src={hub.image}
                    alt={`${hub.city} student neighborhood`}
                    fallbackIcon="location_city"
                    fallbackLabel={hub.city}
                  />
                  {liveCount !== undefined && (
                    <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur-xs px-2 py-0.5 rounded-full text-on-surface text-[11px] font-semibold tabular-nums">
                      {liveCount} {liveCount === 1 ? 'Listing' : 'Listings'}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-title-md text-on-surface font-semibold">{hub.city}</h4>
                    <span className="text-label-sm text-primary font-semibold">{hub.badge}</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant line-clamp-1">{hub.areas}</p>
                  <div className="flex items-center gap-1.5 pt-1 text-on-surface-variant text-[11px] font-medium">
                    <span className="material-symbols-outlined text-[15px] text-primary">
                      school
                    </span>
                    <span>{hub.colleges}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Community Impact & Footer Action Grid */}
      <div className="px-4 lg:px-8 py-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="w-full bg-gradient-to-br from-primary-container via-primary to-on-primary-fixed-variant rounded-2xl p-5 lg:p-6 text-on-primary shadow-lg flex flex-col justify-between gap-4 relative overflow-hidden">
          <span className="material-symbols-outlined absolute -right-6 -bottom-6 text-[120px] text-white/10 pointer-events-none select-none">
            savings
          </span>
          <div className="space-y-2">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-on-primary text-[11px] uppercase tracking-wider font-semibold">
              Community Mission
            </span>
            <h3 className="text-display-mobile font-bold tracking-tight leading-tight text-white">
              Zero Brokerage &amp; Free Textbooks
            </h3>
            <p className="text-body-md text-primary-fixed leading-relaxed">
              Every room listing connects students directly without middlemen, and every Free
              Donation textbook on BookBridge is strictly ₹0.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex flex-col p-3 rounded-xl bg-white/10 backdrop-blur-xs">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-primary-fixed">
                  bed
                </span>
                <span className="text-title-md font-bold text-white tabular-nums">
                  {liveCounts ? liveCounts.flats : '0%'}
                </span>
              </div>
              <span className="text-body-sm text-white/80">
                {liveCounts ? 'Published Rooms' : 'Broker Commission'}
              </span>
            </div>
            <div className="flex flex-col p-3 rounded-xl bg-white/10 backdrop-blur-xs">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-primary-fixed">
                  auto_stories
                </span>
                <span className="text-title-md font-bold text-white tabular-nums">
                  {liveCounts ? liveCounts.books : '₹0'}
                </span>
              </div>
              <span className="text-body-sm text-white/80">
                {liveCounts ? 'Shared Textbooks' : 'Donation Book Fee'}
              </span>
            </div>
          </div>
        </section>

        {/* Quick Post / Donate Action Card */}
        <section className="w-full bg-surface-container-highest rounded-2xl p-5 lg:p-6 flex flex-col justify-between gap-4 text-center shadow-xs">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-xs mb-1">
              <span className="material-symbols-outlined text-[24px]">add_circle</span>
            </div>
            <h3 className="text-headline-sm text-on-surface">
              Have an empty room or spare books?
            </h3>
            <p className="text-body-md text-on-surface-variant max-w-md">
              Help a junior settle in near campus or pass forward your semester syllabus textbooks
              in under two minutes.
            </p>
          </div>

          {!showPostDrawer ? (
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPostDrawer(true)}
                className="w-full h-11 rounded-xl bg-primary text-on-primary text-label-md font-semibold shadow-xs active:scale-[0.99] transition-transform"
              >
                Post a Listing or Donate a Book
              </button>
              <span className="text-[11px] font-medium text-on-surface-variant">
                100% Free for university students
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <Link
                to="/flats/new"
                className="h-11 rounded-xl bg-primary text-on-primary text-label-md font-semibold flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span className="material-symbols-outlined text-[18px]">add_home</span>
                <span>Post Room / Flat</span>
              </Link>
              <Link
                to="/books/new"
                className="h-11 rounded-xl bg-secondary text-on-secondary text-label-md font-semibold flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span className="material-symbols-outlined text-[18px]">menu_book</span>
                <span>Donate / Swap Book</span>
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
