import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase';
import { CONDITION_METADATA } from '../lib/bookStateMachine';
import { canDisplayCollegeVerifiedBadge } from '../lib/verification';
import type { BookCondition, BookListing, BookListingType } from '../types/database';
import { ResilientImage } from '../components/ResilientImage';
import { SafetyBanner } from '../components/SafetyBanner';

const PAGE_SIZE = 12;
const DEPARTMENTS = ['All', 'CSE', 'ECE', 'EEE', 'Mechanical', 'Civil', 'IT', 'AI & DS', 'Commerce', 'Physics'];

export function BooksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, savedBookIds, toggleSaveBook } = useAuth();
  const { showToast } = useToast();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [department, setDepartment] = useState(searchParams.get('dept') || 'All');
  const [semester, setSemester] = useState(searchParams.get('sem') || '');
  const [listingType, setListingType] = useState<'all' | BookListingType>('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | BookCondition>('all');
  const [availableOnly, setAvailableOnly] = useState(true);
  const [page, setPage] = useState(0);

  const [books, setBooks] = useState<BookListing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const fetchBooks = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      let builder = supabase
        .from('book_listings')
        .select('*, donor:profiles!book_listings_donor_id_fkey(*)', { count: 'exact' });

      if (availableOnly) {
        builder = builder.eq('availability_status', 'available');
      } else {
        builder = builder.in('availability_status', ['available', 'reserved', 'completed']);
      }

      if (department !== 'All') {
        builder = builder.ilike('department', `%${department}%`);
      }
      if (semester) {
        builder = builder.eq('semester', Number(semester));
      }
      if (listingType !== 'all') {
        builder = builder.eq('listing_type', listingType);
      }
      if (conditionFilter !== 'all') {
        builder = builder.eq('condition', conditionFilter);
      }
      const trimmed = query.trim();
      if (trimmed) {
        builder = builder.or(
          `title.ilike.%${trimmed}%,author.ilike.%${trimmed}%,course_code.ilike.%${trimmed}%,subject.ilike.%${trimmed}%,isbn.ilike.%${trimmed}%`
        );
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error: dbErr } = await builder
        .order('created_at', { ascending: false })
        .range(from, to);

      if (dbErr) throw new Error(formatSupabaseError(dbErr));
      setBooks((data as BookListing[] | null) ?? []);
      setTotalCount(count ?? 0);
    } catch (err) {
      setError(formatSupabaseError(err, 'Failed to load BookBridge listings.'));
    } finally {
      setLoading(false);
    }
  }, [availableOnly, conditionFilter, department, listingType, page, query, semester]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    if (department !== 'All') next.set('dept', department);
    if (semester) next.set('sem', semester);
    setSearchParams(next, { replace: true });
  };

  const handleToggleSave = async (bookId: string) => {
    if (!user) {
      navigate('/auth?redirect=/books');
      return;
    }
    try {
      const saved = await toggleSaveBook(bookId);
      showToast({
        variant: 'info',
        title: saved ? 'Saved to Bookmarks' : 'Removed from Bookmarks',
      });
    } catch (err) {
      showToast({ variant: 'error', title: 'Could not update saved state', description: formatSupabaseError(err) });
    }
  };

  return (
    <div className="px-4 lg:px-8 py-4 space-y-5">
      {/* Header & Donate CTA */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-label-sm">
              BookBridge Exchange
            </span>
            <span className="text-label-sm text-secondary font-semibold tabular-nums">
              {totalCount} {totalCount === 1 ? 'Textbook' : 'Textbooks'}
            </span>
          </div>
          <h1 className="text-headline-lg-mobile lg:text-headline-lg text-on-surface font-bold tracking-tight">
            Free Textbooks &amp; Campus Swaps
          </h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Request semester books from verified seniors or pass forward your syllabus copies at ₹0.
          </p>
        </div>

        <Link
          to="/books/new"
          className="h-11 px-5 rounded-xl bg-secondary text-on-secondary text-label-md font-semibold shadow-xs flex items-center justify-center gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[19px]">volunteer_activism</span>
          <span>Donate or Swap Book</span>
        </Link>
      </section>

      {/* Search & Filter Controls */}
      <section className="space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary text-[20px]">
              search
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search title, author, course code (e.g. CS8591), or ISBN..."
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-surface-container-lowest shadow-xs text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary"
            />
          </div>
          <button
            type="submit"
            className="h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface text-label-md font-semibold shadow-xs hover:bg-surface-container"
          >
            Filter
          </button>
        </form>

        {/* Scrollable Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <select
            aria-label="Filter by department"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(0);
            }}
            className="h-9 px-3 rounded-full bg-surface-container-lowest text-label-sm text-on-surface shadow-xs shrink-0"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d === 'All' ? 'All Departments' : `${d} Dept`}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by semester"
            value={semester}
            onChange={(e) => {
              setSemester(e.target.value);
              setPage(0);
            }}
            className="h-9 px-3 rounded-full bg-surface-container-lowest text-label-sm text-on-surface shadow-xs shrink-0"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={String(s)}>
                Semester {s}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setListingType((prev) =>
                prev === 'free_donation' ? 'all' : 'free_donation'
              );
              setPage(0);
            }}
            className={`shrink-0 h-9 px-3.5 rounded-full text-label-sm shadow-xs transition-colors ${
              listingType === 'free_donation'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
          >
            Free Donation Only
          </button>

          <button
            type="button"
            onClick={() => {
              setListingType((prev) => (prev === 'exchange' ? 'all' : 'exchange'));
              setPage(0);
            }}
            className={`shrink-0 h-9 px-3.5 rounded-full text-label-sm shadow-xs transition-colors ${
              listingType === 'exchange'
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
          >
            Book Swap
          </button>

          <select
            aria-label="Filter by condition"
            value={conditionFilter}
            onChange={(e) => {
              setConditionFilter(e.target.value as 'all' | BookCondition);
              setPage(0);
            }}
            className="h-9 px-3 rounded-full bg-surface-container-lowest text-label-sm text-on-surface shadow-xs shrink-0"
          >
            <option value="all">Any Condition</option>
            <option value="new">Like New</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="marked">Highlighted</option>
            <option value="worn">Well Used</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setAvailableOnly((v) => !v);
              setPage(0);
            }}
            className={`shrink-0 h-9 px-3.5 rounded-full text-label-sm shadow-xs transition-colors ${
              availableOnly
                ? 'bg-surface-container-high text-on-surface font-semibold'
                : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
          >
            {availableOnly ? 'Available Now ✓' : 'Include Reserved'}
          </button>
        </div>
      </section>

      <SafetyBanner mode="book_handover" />

      {/* Feed Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-44 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-surface-container-lowest rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <p className="text-title-md text-error font-semibold">Unable to load textbooks</p>
          <p className="text-body-sm text-on-surface-variant">{error}</p>
          <button
            type="button"
            onClick={fetchBooks}
            className="h-10 px-4 rounded-xl bg-primary text-on-primary text-label-md font-semibold"
          >
            Retry
          </button>
        </div>
      ) : books.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[24px]">auto_stories</span>
          </div>
          <h2 className="text-title-md font-semibold text-on-surface">
            No matching textbooks found
          </h2>
          <p className="text-body-sm text-on-surface-variant max-w-md mx-auto">
            {isSupabaseConfigured
              ? 'Be the first student on your campus to donate a semester textbook or adjust your branch/semester filters.'
              : 'Connect your Supabase project credentials to browse and publish real BookBridge textbook listings.'}
          </p>
          <Link
            to="/books/new"
            className="inline-flex h-10 px-5 rounded-xl bg-secondary text-on-secondary text-label-md font-semibold items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Donate a Textbook</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((book) => {
            const cond = CONDITION_METADATA[book.condition] || CONDITION_METADATA.good;
            const isSaved = savedBookIds.has(book.id);
            const donorVerified = canDisplayCollegeVerifiedBadge(book.donor);

            return (
              <article
                key={book.id}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-3.5">
                  <Link
                    to={`/books/${book.id}`}
                    className="w-20 h-28 rounded-lg bg-surface-container-high overflow-hidden shrink-0 shadow-inner"
                  >
                    <ResilientImage
                      src={book.photo_urls?.[0]}
                      alt={book.title}
                      fallbackIcon="menu_book"
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          book.listing_type === 'free_donation'
                            ? 'bg-primary-fixed text-on-primary-fixed-variant'
                            : 'bg-secondary-fixed text-on-secondary-fixed-variant'
                        }`}
                      >
                        {book.listing_type === 'free_donation' ? 'Free Donation' : 'Exchange'}
                      </span>
                      <button
                        type="button"
                        aria-label={isSaved ? 'Remove bookmark' : 'Bookmark book'}
                        onClick={() => handleToggleSave(book.id)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center ${
                          isSaved ? 'text-error' : 'text-outline hover:text-on-surface'
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

                    <Link to={`/books/${book.id}`}>
                      <h2 className="text-title-md text-on-surface font-semibold mt-1 line-clamp-1 hover:text-secondary">
                        {book.title}
                      </h2>
                    </Link>
                    <p className="text-body-sm text-on-surface-variant line-clamp-1">
                      {book.author}
                      {book.edition ? ` • ${book.edition}` : ''}
                    </p>
                    <p className="text-[12px] text-on-surface-variant mt-1">
                      {book.department} • Sem {book.semester}
                      {book.course_code ? ` • ${book.course_code}` : ''}
                    </p>

                    {/* Stitch 5-Bar Condition Meter */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="flex gap-0.5" aria-label={`Condition ${cond.score} of 5`}>
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
                </div>

                <div className="pt-2.5 border-t border-surface-container flex items-center justify-between gap-2">
                  <div className="min-w-0 text-[12px] text-on-surface-variant truncate flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-primary">
                      pin_drop
                    </span>
                    <span className="truncate">
                      {book.preferred_pickup_spot} • {book.college_name}
                    </span>
                    {donorVerified && (
                      <span
                        title="College Verified Student"
                        className="material-symbols-outlined text-[14px] text-primary material-icon-filled shrink-0"
                      >
                        verified
                      </span>
                    )}
                  </div>

                  <Link
                    to={`/books/${book.id}`}
                    className={`shrink-0 px-3.5 py-1.5 rounded-lg text-label-sm font-semibold shadow-xs ${
                      book.availability_status === 'available'
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {book.availability_status === 'available'
                      ? 'Request'
                      : book.availability_status === 'reserved'
                        ? 'Reserved'
                        : 'Completed'}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="h-9 px-4 rounded-xl bg-surface-container-lowest text-label-sm font-semibold disabled:opacity-40"
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
            className="h-9 px-4 rounded-xl bg-surface-container-lowest text-label-sm font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
