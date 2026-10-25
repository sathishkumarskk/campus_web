import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  deleteStoragePaths,
  formatSupabaseError,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase';
import { type BookRequestAction } from '../lib/bookStateMachine';
import type {
  AccommodationListing,
  BookListing,
  BookRequest,
  Conversation,
  FlatmateConnection,
  FlatRequest,
  SavedItem,
} from '../types/database';

type ActivityTab = 'listings' | 'saved' | 'flats' | 'connections' | 'books';

const TABS: { key: ActivityTab; label: string; icon: string }[] = [
  { key: 'listings', label: 'My Listings', icon: 'inventory_2' },
  { key: 'saved', label: 'Saved Items', icon: 'favorite' },
  { key: 'flats', label: 'Flat Requests', icon: 'apartment' },
  { key: 'connections', label: 'Flatmate Matches', icon: 'group' },
  { key: 'books', label: 'Book Handovers', icon: 'menu_book' },
];

export function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, toggleSaveFlat, toggleSaveBook } = useAuth();
  const { showToast } = useToast();

  const initialTab = (searchParams.get('tab') as ActivityTab) || 'listings';
  const [activeTab, setActiveTab] = useState<ActivityTab>(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'listings'
  );

  const [myFlats, setMyFlats] = useState<AccommodationListing[]>([]);
  const [myBooks, setMyBooks] = useState<BookListing[]>([]);
  const [savedRows, setSavedRows] = useState<SavedItem[]>([]);
  const [flatRequests, setFlatRequests] = useState<FlatRequest[]>([]);
  const [connections, setConnections] = useState<FlatmateConnection[]>([]);
  const [bookRequests, setBookRequests] = useState<BookRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAllActivity = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [flatsRes, booksRes, savedRes, flatReqsRes, connsRes, bookReqsRes] = await Promise.all([
        supabase
          .from('accommodation_listings')
          .select('*, images:accommodation_images(*)')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('book_listings')
          .select('*')
          .eq('donor_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('saved_items')
          .select('*, flat:accommodation_listings(*), book:book_listings(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('flat_requests')
          .select(
            '*, listing:accommodation_listings(*), requester:profiles!flat_requests_requester_id_fkey(*), owner:profiles!flat_requests_owner_id_fkey(*)'
          )
          .or(`owner_id.eq.${user.id},requester_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
        supabase
          .from('flatmate_connections')
          .select(
            '*, sender:profiles!flatmate_connections_sender_id_fkey(*), receiver:profiles!flatmate_connections_receiver_id_fkey(*)'
          )
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
        supabase
          .from('book_requests')
          .select(
            '*, book:book_listings(*), requester:profiles!book_requests_requester_id_fkey(*), donor:profiles!book_requests_donor_id_fkey(*)'
          )
          .or(`donor_id.eq.${user.id},requester_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
      ]);

      setMyFlats((flatsRes.data as AccommodationListing[] | null) ?? []);
      setMyBooks((booksRes.data as BookListing[] | null) ?? []);
      setSavedRows((savedRes.data as SavedItem[] | null) ?? []);
      setFlatRequests((flatReqsRes.data as FlatRequest[] | null) ?? []);
      setConnections((connsRes.data as FlatmateConnection[] | null) ?? []);
      setBookRequests((bookReqsRes.data as BookRequest[] | null) ?? []);
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Could not load activity history',
        description: formatSupabaseError(err),
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, user]);

  useEffect(() => {
    loadAllActivity();
  }, [loadAllActivity]);

  const selectTab = (tab: ActivityTab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const openContextConversation = async (
    contextType: Conversation['context_type'],
    contextId: string
  ) => {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('context_type', contextType)
      .eq('context_id', contextId)
      .maybeSingle();

    if (data) {
      navigate(`/messages/${(data as Pick<Conversation, 'id'>).id}`);
    } else {
      navigate('/messages');
    }
  };

  const handleDeleteMyFlat = async (flat: AccommodationListing) => {
    setBusyId(flat.id);
    try {
      const paths = (flat.images || []).map((i) => i.storage_path);
      await deleteStoragePaths('accommodations', paths);
      const { error } = await supabase.from('accommodation_listings').delete().eq('id', flat.id);
      if (error) throw new Error(formatSupabaseError(error));
      showToast({ variant: 'info', title: 'Accommodation listing deleted' });
      await loadAllActivity();
    } catch (err) {
      showToast({ variant: 'error', title: 'Delete failed', description: formatSupabaseError(err) });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteMyBook = async (book: BookListing) => {
    setBusyId(book.id);
    try {
      await deleteStoragePaths('books', book.photo_paths || []);
      const { error } = await supabase.from('book_listings').delete().eq('id', book.id);
      if (error) throw new Error(formatSupabaseError(error));
      showToast({ variant: 'info', title: 'Book listing removed' });
      await loadAllActivity();
    } catch (err) {
      showToast({ variant: 'error', title: 'Remove failed', description: formatSupabaseError(err) });
    } finally {
      setBusyId(null);
    }
  };

  const handleFlatRequestUpdate = async (
    reqId: string,
    status: 'accepted' | 'declined' | 'cancelled'
  ) => {
    setBusyId(reqId);
    try {
      const { error } = await supabase.from('flat_requests').update({ status }).eq('id', reqId);
      if (error) throw new Error(formatSupabaseError(error));
      showToast({
        variant: 'success',
        title: status === 'accepted' ? 'Inquiry Accepted — Chat Ready' : `Inquiry ${status}`,
      });
      await loadAllActivity();
    } catch (err) {
      showToast({ variant: 'error', title: 'Update failed', description: formatSupabaseError(err) });
    } finally {
      setBusyId(null);
    }
  };

  const handleConnectionUpdate = async (
    connId: string,
    status: 'accepted' | 'declined' | 'cancelled'
  ) => {
    setBusyId(connId);
    try {
      const { error } = await supabase
        .from('flatmate_connections')
        .update({ status })
        .eq('id', connId);
      if (error) throw new Error(formatSupabaseError(error));
      showToast({
        variant: 'success',
        title: status === 'accepted' ? 'Flatmate Connected!' : `Connection ${status}`,
      });
      await loadAllActivity();
    } catch (err) {
      showToast({ variant: 'error', title: 'Update failed', description: formatSupabaseError(err) });
    } finally {
      setBusyId(null);
    }
  };

  const handleBookTransition = async (req: BookRequest, action: BookRequestAction) => {
    setBusyId(req.id);
    try {
      const { error } = await supabase.rpc('transition_book_request', {
        p_request_id: req.id,
        p_action: action,
        p_scheduled_spot: req.proposed_spot,
        p_scheduled_time: req.proposed_time,
      });
      if (error) throw new Error(formatSupabaseError(error));
      showToast({ variant: 'success', title: 'Book handover status updated' });
      await loadAllActivity();
    } catch (err) {
      showToast({ variant: 'error', title: 'Action failed', description: formatSupabaseError(err) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 space-y-5">
      <div>
        <h1 className="text-headline-md text-on-surface font-bold">
          Activity &amp; Requests Center
        </h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">
          Manage your room listings, donated textbooks, saved items, flatmate intros, and campus
          handovers in one place.
        </p>
      </div>

      {/* Segmented Interactive Tab Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 bg-surface-container-low rounded-xl">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`shrink-0 px-3.5 py-2 rounded-lg text-label-md font-semibold flex items-center gap-1.5 transition-colors ${
                active
                  ? 'bg-surface-container-lowest text-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* TAB 1: MY LISTINGS */}
          {activeTab === 'listings' && (
            <div className="space-y-6">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-title-md font-semibold text-on-surface">
                    My Accommodation Listings ({myFlats.length})
                  </h2>
                  <Link
                    to="/flats/new"
                    className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>Post Room</span>
                  </Link>
                </div>

                {myFlats.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant bg-surface-container-lowest p-5 rounded-xl">
                    You have not posted any accommodation listings yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {myFlats.map((flat) => (
                      <div
                        key={flat.id}
                        className="bg-surface-container-lowest rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/flats/${flat.id}`}
                              className="text-title-md font-semibold text-on-surface hover:text-primary"
                            >
                              {flat.title}
                            </Link>
                            <span className="text-label-sm text-outline capitalize">
                              · {flat.status}
                            </span>
                          </div>
                          <p className="text-body-sm text-on-surface-variant tabular-nums">
                            ₹{flat.rent_monthly.toLocaleString('en-IN')}/mo • {flat.locality},{' '}
                            {flat.city} • {flat.spots_available}/{flat.spots_total} open
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            to={`/flats/${flat.id}`}
                            className="h-9 px-3 rounded-lg bg-surface-container text-label-sm font-semibold flex items-center"
                          >
                            View
                          </Link>
                          <Link
                            to={`/flats/${flat.id}/edit`}
                            className="h-9 px-3 rounded-lg bg-surface-container text-label-sm font-semibold flex items-center"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            disabled={busyId === flat.id}
                            onClick={() => handleDeleteMyFlat(flat)}
                            className="h-9 px-3 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-title-md font-semibold text-on-surface">
                    My BookBridge Listings ({myBooks.length})
                  </h2>
                  <Link
                    to="/books/new"
                    className="h-9 px-3.5 rounded-lg bg-secondary text-on-secondary text-label-sm font-semibold flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>Donate Book</span>
                  </Link>
                </div>

                {myBooks.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant bg-surface-container-lowest p-5 rounded-xl">
                    You have not listed any textbooks on BookBridge yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {myBooks.map((book) => (
                      <div
                        key={book.id}
                        className="bg-surface-container-lowest rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/books/${book.id}`}
                              className="text-title-md font-semibold text-on-surface hover:text-secondary"
                            >
                              {book.title}
                            </Link>
                            <span className="text-label-sm text-outline capitalize">
                              · {book.availability_status}
                            </span>
                          </div>
                          <p className="text-body-sm text-on-surface-variant">
                            {book.author} • {book.department} Sem {book.semester} •{' '}
                            {book.listing_type === 'free_donation' ? 'Free Donation' : 'Exchange'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            to={`/books/${book.id}`}
                            className="h-9 px-3 rounded-lg bg-surface-container text-label-sm font-semibold flex items-center"
                          >
                            View
                          </Link>
                          <Link
                            to={`/books/${book.id}/edit`}
                            className="h-9 px-3 rounded-lg bg-surface-container text-label-sm font-semibold flex items-center"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            disabled={busyId === book.id}
                            onClick={() => handleDeleteMyBook(book)}
                            className="h-9 px-3 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: SAVED ITEMS */}
          {activeTab === 'saved' && (
            <div className="space-y-3">
              {savedRows.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-xl p-8 text-center space-y-2">
                  <p className="text-title-md font-semibold text-on-surface">No saved items yet</p>
                  <p className="text-body-sm text-on-surface-variant">
                    Tap the heart icon on any room or textbook to bookmark it here.
                  </p>
                </div>
              ) : (
                savedRows.map((item) => {
                  if (item.item_type === 'flat' && item.flat) {
                    return (
                      <div
                        key={item.id}
                        className="bg-surface-container-lowest rounded-xl p-4 shadow-xs flex items-center justify-between gap-3"
                      >
                        <div>
                          <span className="text-[11px] font-semibold uppercase text-primary">
                            Saved Room
                          </span>
                          <Link
                            to={`/flats/${item.flat.id}`}
                            className="block text-title-md font-semibold text-on-surface hover:text-primary"
                          >
                            {item.flat.title}
                          </Link>
                          <p className="text-body-sm text-on-surface-variant tabular-nums">
                            ₹{item.flat.rent_monthly.toLocaleString('en-IN')}/mo •{' '}
                            {item.flat.locality}, {item.flat.city}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await toggleSaveFlat(item.flat!.id);
                            await loadAllActivity();
                          }}
                          className="h-9 px-3 rounded-lg bg-surface-container text-label-sm font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }
                  if (item.item_type === 'book' && item.book) {
                    return (
                      <div
                        key={item.id}
                        className="bg-surface-container-lowest rounded-xl p-4 shadow-xs flex items-center justify-between gap-3"
                      >
                        <div>
                          <span className="text-[11px] font-semibold uppercase text-secondary">
                            Saved Textbook
                          </span>
                          <Link
                            to={`/books/${item.book.id}`}
                            className="block text-title-md font-semibold text-on-surface hover:text-secondary"
                          >
                            {item.book.title}
                          </Link>
                          <p className="text-body-sm text-on-surface-variant">
                            {item.book.author} • {item.book.department} Sem {item.book.semester}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await toggleSaveBook(item.book!.id);
                            await loadAllActivity();
                          }}
                          className="h-9 px-3 rounded-lg bg-surface-container text-label-sm font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }
                  return null;
                })
              )}
            </div>
          )}

          {/* TAB 3: FLAT REQUESTS */}
          {activeTab === 'flats' && (
            <div className="space-y-3">
              {flatRequests.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-xl p-8 text-center space-y-2">
                  <p className="text-title-md font-semibold text-on-surface">
                    No room inquiries yet
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    Expressions of interest you send or receive on FlatMate listings appear here.
                  </p>
                </div>
              ) : (
                flatRequests.map((req) => {
                  const isOwner = req.owner_id === user?.id;
                  return (
                    <div
                      key={req.id}
                      className="bg-surface-container-lowest rounded-xl p-4 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-semibold uppercase text-primary">
                            {isOwner ? 'Incoming Inquiry on Your Room' : 'Outgoing Room Inquiry'}
                          </span>
                          <Link
                            to={`/flats/${req.listing_id}`}
                            className="block text-title-md font-semibold text-on-surface hover:text-primary"
                          >
                            {req.listing?.title || 'Accommodation Listing'}
                          </Link>
                        </div>
                        <span className="text-label-sm font-semibold capitalize text-on-surface-variant">
                          {req.status}
                        </span>
                      </div>

                      <p className="text-body-sm text-on-surface-variant">
                        {isOwner
                          ? `From: ${req.requester?.full_name || 'Student'}`
                          : `Host: ${req.owner?.full_name || 'Student'}`}{' '}
                        • Move-in: {new Date(req.preferred_move_in).toLocaleDateString('en-IN')}
                      </p>
                      <p className="text-body-sm text-on-surface">“{req.message}”</p>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {isOwner && req.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === req.id}
                              onClick={() => handleFlatRequestUpdate(req.id, 'accepted')}
                              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold"
                            >
                              Accept &amp; Open Chat
                            </button>
                            <button
                              type="button"
                              disabled={busyId === req.id}
                              onClick={() => handleFlatRequestUpdate(req.id, 'declined')}
                              className="h-9 px-3.5 rounded-lg bg-surface-container text-on-surface text-label-sm font-semibold"
                            >
                              Decline
                            </button>
                          </>
                        )}

                        {req.status === 'accepted' && (
                          <button
                            type="button"
                            onClick={() => openContextConversation('flat_request', req.id)}
                            className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[16px]">chat</span>
                            <span>Open Chat</span>
                          </button>
                        )}

                        {!isOwner && ['pending', 'accepted'].includes(req.status) && (
                          <button
                            type="button"
                            disabled={busyId === req.id}
                            onClick={() => handleFlatRequestUpdate(req.id, 'cancelled')}
                            className="h-9 px-3.5 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 4: FLATMATE CONNECTIONS */}
          {activeTab === 'connections' && (
            <div className="space-y-3">
              {connections.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-xl p-8 text-center space-y-2">
                  <p className="text-title-md font-semibold text-on-surface">
                    No flatmate connections yet
                  </p>
                  <Link
                    to="/flatmates"
                    className="inline-block text-label-md text-primary font-semibold"
                  >
                    Browse Compatible Campus Peers →
                  </Link>
                </div>
              ) : (
                connections.map((conn) => {
                  const isReceiver = conn.receiver_id === user?.id;
                  const peer = isReceiver ? conn.sender : conn.receiver;

                  return (
                    <div
                      key={conn.id}
                      className="bg-surface-container-lowest rounded-xl p-4 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-semibold uppercase text-primary">
                            {isReceiver ? 'Incoming Flatmate Intro' : 'Sent Flatmate Intro'} •{' '}
                            {conn.compatibility_score}% Match
                          </span>
                          <p className="text-title-md font-semibold text-on-surface">
                            {peer?.full_name || 'Campus Peer'}
                          </p>
                          <p className="text-body-sm text-on-surface-variant">
                            {peer?.college_name} • {peer?.course} {peer?.department}
                          </p>
                        </div>
                        <span className="text-label-sm font-semibold capitalize text-on-surface-variant">
                          {conn.status}
                        </span>
                      </div>

                      {conn.intro_message && (
                        <p className="text-body-sm text-on-surface">“{conn.intro_message}”</p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {isReceiver && conn.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === conn.id}
                              onClick={() => handleConnectionUpdate(conn.id, 'accepted')}
                              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold"
                            >
                              Accept Intro
                            </button>
                            <button
                              type="button"
                              disabled={busyId === conn.id}
                              onClick={() => handleConnectionUpdate(conn.id, 'declined')}
                              className="h-9 px-3.5 rounded-lg bg-surface-container text-on-surface text-label-sm font-semibold"
                            >
                              Decline
                            </button>
                          </>
                        )}

                        {conn.status === 'accepted' && (
                          <button
                            type="button"
                            onClick={() => openContextConversation('flatmate_connection', conn.id)}
                            className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[16px]">chat</span>
                            <span>Message</span>
                          </button>
                        )}

                        {!isReceiver && conn.status === 'pending' && (
                          <button
                            type="button"
                            disabled={busyId === conn.id}
                            onClick={() => handleConnectionUpdate(conn.id, 'cancelled')}
                            className="h-9 px-3.5 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                          >
                            Cancel Request
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 5: BOOK REQUESTS & CAMPUS HANDOVERS */}
          {activeTab === 'books' && (
            <div className="space-y-3">
              {bookRequests.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-xl p-8 text-center space-y-2">
                  <p className="text-title-md font-semibold text-on-surface">
                    No textbook requests or handovers yet
                  </p>
                  <Link
                    to="/books"
                    className="inline-block text-label-md text-secondary font-semibold"
                  >
                    Explore BookBridge Textbooks →
                  </Link>
                </div>
              ) : (
                bookRequests.map((req) => {
                  const isDonor = req.donor_id === user?.id;
                  const activeRes = ['accepted', 'reserved', 'handover_scheduled'].includes(
                    req.status
                  );

                  return (
                    <div
                      key={req.id}
                      className="bg-surface-container-lowest rounded-xl p-4 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-semibold uppercase text-secondary">
                            {isDonor ? 'Incoming Donor Request' : 'Your Textbook Request'}
                          </span>
                          <Link
                            to={`/books/${req.book_id}`}
                            className="block text-title-md font-semibold text-on-surface hover:text-secondary"
                          >
                            {req.book?.title || 'Textbook'}
                          </Link>
                        </div>
                        <span className="text-label-sm font-semibold capitalize text-on-surface-variant">
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>

                      <p className="text-body-sm text-on-surface-variant">
                        {isDonor
                          ? `Requester: ${req.requester?.full_name || 'Student'}`
                          : `Donor: ${req.donor?.full_name || 'Senior'}`}{' '}
                        • Campus Spot: <strong>{req.proposed_spot}</strong> ({req.proposed_time})
                      </p>

                      {activeRes && (
                        <p className="text-[12px] text-outline">
                          Handover Confirmations — Donor:{' '}
                          <strong>{req.donor_confirmed ? 'Confirmed ✓' : 'Pending'}</strong> ·
                          Requester:{' '}
                          <strong>{req.requester_confirmed ? 'Confirmed ✓' : 'Pending'}</strong>
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {isDonor && req.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === req.id}
                              onClick={() => handleBookTransition(req, 'accept')}
                              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold"
                            >
                              Accept &amp; Reserve
                            </button>
                            <button
                              type="button"
                              disabled={busyId === req.id}
                              onClick={() => handleBookTransition(req, 'decline')}
                              className="h-9 px-3.5 rounded-lg bg-surface-container text-on-surface text-label-sm font-semibold"
                            >
                              Decline
                            </button>
                          </>
                        )}

                        {activeRes && (
                          <>
                            <button
                              type="button"
                              disabled={
                                busyId === req.id ||
                                (isDonor && req.donor_confirmed) ||
                                (!isDonor && req.requester_confirmed)
                              }
                              onClick={() => handleBookTransition(req, 'confirm_handover')}
                              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-45"
                            >
                              Confirm Handover Complete
                            </button>
                            <button
                              type="button"
                              onClick={() => openContextConversation('book_request', req.id)}
                              className="h-9 px-3.5 rounded-lg bg-surface-container-highest text-on-surface text-label-sm font-semibold flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[16px]">chat</span>
                              <span>Chat</span>
                            </button>
                          </>
                        )}

                        {!['completed', 'declined', 'cancelled'].includes(req.status) && (
                          <button
                            type="button"
                            disabled={busyId === req.id}
                            onClick={() => handleBookTransition(req, 'cancel')}
                            className="h-9 px-3.5 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
