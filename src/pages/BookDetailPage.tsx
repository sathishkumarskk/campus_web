import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  deleteStoragePaths,
  formatSupabaseError,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase';
import {
  canPerformBookRequestAction,
  CONDITION_METADATA,
  type BookRequestAction,
} from '../lib/bookStateMachine';
import { canDisplayCollegeVerifiedBadge } from '../lib/verification';
import type { BookListing, BookRequest, Conversation } from '../types/database';
import { ResilientImage } from '../components/ResilientImage';
import { SafetyBanner } from '../components/SafetyBanner';
import { ReportModal } from '../components/ReportModal';

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, savedBookIds, toggleSaveBook } = useAuth();
  const { showToast } = useToast();

  const [book, setBook] = useState<BookListing | null>(null);
  const [requests, setRequests] = useState<BookRequest[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Request Form State
  const [reqMessage, setReqMessage] = useState('');
  const [proposedSpot, setProposedSpot] = useState('');
  const [proposedTime, setProposedTime] = useState('Tomorrow 4:00 PM');
  const [exchangeNote, setExchangeNote] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const loadBookAndRequests = useCallback(async () => {
    if (!id || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('book_listings')
      .select('*, donor:profiles!book_listings_donor_id_fkey(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      setFetchError(formatSupabaseError(error, 'Failed to load textbook listing.'));
      setBook(null);
      setLoading(false);
      return;
    }

    if (!data) {
      setBook(null);
      setLoading(false);
      return;
    }

    const loadedBook = data as BookListing;
    setBook(loadedBook);
    setProposedSpot((prev) => prev || loadedBook.preferred_pickup_spot);

    if (user) {
      const { data: reqData } = await supabase
        .from('book_requests')
        .select(
          '*, requester:profiles!book_requests_requester_id_fkey(*), donor:profiles!book_requests_donor_id_fkey(*)'
        )
        .eq('book_id', id)
        .order('created_at', { ascending: false });
      setRequests((reqData as BookRequest[] | null) ?? []);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    loadBookAndRequests();
  }, [loadBookAndRequests]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !book) {
      navigate(`/auth?redirect=/books/${id}`);
      return;
    }
    if (book.listing_type === 'exchange' && exchangeNote.trim().length < 3) {
      showToast({
        variant: 'error',
        title: 'Specify exchange book',
        description: 'Tell the donor which book/material you are offering in swap.',
      });
      return;
    }

    setSubmittingReq(true);
    try {
      const { error } = await supabase.from('book_requests').insert({
        book_id: book.id,
        requester_id: user.id,
        donor_id: book.donor_id,
        message: reqMessage.trim(),
        proposed_spot: proposedSpot.trim(),
        proposed_time: proposedTime.trim(),
        agreed_exchange_note: book.listing_type === 'exchange' ? exchangeNote.trim() : null,
      });

      if (error) throw new Error(formatSupabaseError(error));
      showToast({
        variant: 'success',
        title: 'Textbook Request Sent!',
        description: 'The donor has been notified of your campus pickup proposal.',
      });
      setReqMessage('');
      await loadBookAndRequests();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Could not submit request',
        description: formatSupabaseError(err),
      });
    } finally {
      setSubmittingReq(false);
    }
  };

  const handleTransition = async (req: BookRequest, action: BookRequestAction) => {
    if (!user || !book) return;

    const check = canPerformBookRequestAction({
      actorId: user.id,
      donorId: req.donor_id,
      requesterId: req.requester_id,
      currentStatus: req.status,
      bookAvailability: book.availability_status,
      action,
      donorConfirmed: req.donor_confirmed,
      requesterConfirmed: req.requester_confirmed,
    });

    if (!check.allowed) {
      showToast({ variant: 'error', title: 'Action not permitted', description: check.reason });
      return;
    }

    setActionBusyId(req.id);
    try {
      const { error } = await supabase.rpc('transition_book_request', {
        p_request_id: req.id,
        p_action: action,
        p_scheduled_spot: req.proposed_spot,
        p_scheduled_time: req.proposed_time,
      });

      if (error) throw new Error(formatSupabaseError(error));
      showToast({
        variant: 'success',
        title:
          action === 'accept'
            ? 'Request Accepted & Book Reserved'
            : action === 'confirm_handover'
              ? 'Handover Confirmation Recorded'
              : 'Request Updated',
      });
      await loadBookAndRequests();
    } catch (err) {
      showToast({ variant: 'error', title: 'Update failed', description: formatSupabaseError(err) });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleOpenConversation = async (requestId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('context_type', 'book_request')
      .eq('context_id', requestId)
      .maybeSingle();
    if (data) {
      navigate(`/messages/${(data as Pick<Conversation, 'id'>).id}`);
    } else {
      navigate('/messages');
    }
  };

  const handleDeleteListing = async () => {
    if (!book || !user || book.donor_id !== user.id) return;
    try {
      await deleteStoragePaths('books', book.photo_paths || []);
      const { error } = await supabase.from('book_listings').delete().eq('id', book.id);
      if (error) throw new Error(formatSupabaseError(error));
      showToast({ variant: 'info', title: 'Book listing removed' });
      navigate('/books');
    } catch (err) {
      showToast({ variant: 'error', title: 'Delete failed', description: formatSupabaseError(err) });
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <div className="h-72 rounded-2xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-3">
        <h1 className="text-headline-sm text-on-surface font-bold">Could Not Load Textbook</h1>
        <p className="text-body-sm text-error">{fetchError}</p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={loadBookAndRequests}
            className="h-9 px-4 rounded-xl bg-secondary text-on-secondary text-label-sm font-semibold"
          >
            Retry
          </button>
          <Link to="/books" className="text-label-md text-secondary font-semibold">
            ← Back to BookBridge
          </Link>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-3">
        <h1 className="text-headline-sm text-on-surface font-bold">Textbook Not Found</h1>
        <Link to="/books" className="text-label-md text-secondary font-semibold">
          ← Back to BookBridge
        </Link>
      </div>
    );
  }

  const isDonor = user?.id === book.donor_id;
  const cond = CONDITION_METADATA[book.condition] || CONDITION_METADATA.good;
  const isSaved = savedBookIds.has(book.id);
  const myExistingRequest = requests.find(
    (r) => r.requester_id === user?.id && !['cancelled', 'declined'].includes(r.status)
  );

  return (
    <div className="px-4 lg:px-8 py-5 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/books" className="text-label-md text-secondary font-semibold flex items-center gap-1">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Back to BookBridge</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!user) return navigate(`/auth?redirect=/books/${book.id}`);
              await toggleSaveBook(book.id);
            }}
            className="h-9 px-3 rounded-xl bg-surface-container-lowest text-label-sm font-semibold flex items-center gap-1 shadow-xs"
          >
            <span
              className={`material-symbols-outlined text-[17px] ${
                isSaved ? 'text-error material-icon-filled' : 'text-on-surface-variant'
              }`}
            >
              favorite
            </span>
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>

          {!isDonor && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="h-9 px-3 rounded-xl bg-surface-container-lowest text-on-surface-variant text-label-sm font-semibold flex items-center gap-1 shadow-xs"
            >
              <span className="material-symbols-outlined text-[17px]">flag</span>
              <span>Report</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Cover & Photos */}
        <div className="lg:col-span-5 space-y-3">
          <div className="aspect-[3/4] max-h-96 w-full rounded-2xl overflow-hidden bg-surface-container-lowest shadow-xs">
            <ResilientImage
              src={book.photo_urls?.[activePhotoIdx]}
              alt={book.title}
              fallbackIcon="menu_book"
              fallbackLabel={book.title}
            />
          </div>
          {book.photo_urls && book.photo_urls.length > 1 && (
            <div className="flex gap-2">
              {book.photo_urls.map((url, idx) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActivePhotoIdx(idx)}
                  className={`w-16 h-20 rounded-lg overflow-hidden border-2 ${
                    idx === activePhotoIdx ? 'border-secondary' : 'border-transparent'
                  }`}
                >
                  <img src={url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Metadata & Request / Donor Management */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-label-sm font-semibold ${
                  book.listing_type === 'free_donation'
                    ? 'bg-primary-fixed text-on-primary-fixed-variant'
                    : 'bg-secondary-fixed text-on-secondary-fixed-variant'
                }`}
              >
                {book.listing_type === 'free_donation' ? 'Free Donation • ₹0' : 'Campus Book Swap'}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-surface-container text-label-sm text-on-surface capitalize">
                Status: {book.availability_status}
              </span>
            </div>

            <div>
              <h1 className="text-headline-md text-on-surface font-bold">{book.title}</h1>
              <p className="text-body-md text-on-surface-variant mt-0.5">
                by {book.author}
                {book.edition ? ` • ${book.edition}` : ''}
                {book.isbn ? ` • ISBN ${book.isbn}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-surface-container-low text-body-sm">
              <div>
                <span className="text-outline block text-[11px] uppercase font-semibold">Branch & Sem</span>
                <span className="font-semibold text-on-surface">
                  {book.department} • Sem {book.semester}
                </span>
              </div>
              <div>
                <span className="text-outline block text-[11px] uppercase font-semibold">Subject</span>
                <span className="font-semibold text-on-surface">
                  {book.subject} {book.course_code ? `(${book.course_code})` : ''}
                </span>
              </div>
              <div>
                <span className="text-outline block text-[11px] uppercase font-semibold">Condition</span>
                <span className="font-semibold text-primary">
                  {cond.label} ({cond.score}/5)
                </span>
              </div>
            </div>

            {book.listing_type === 'exchange' && book.exchange_terms && (
              <div className="p-3.5 rounded-xl bg-secondary-fixed/40 text-on-secondary-fixed text-body-sm">
                <strong>Swap Terms Requested by Donor:</strong> {book.exchange_terms}
              </div>
            )}

            {book.description && (
              <p className="text-body-md text-on-surface-variant leading-relaxed">{book.description}</p>
            )}

            <div className="p-3.5 rounded-xl bg-surface-container-low flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-label-md font-semibold text-on-surface">
                    Shared by {book.donor?.full_name || 'Campus Student'}
                  </span>
                  {canDisplayCollegeVerifiedBadge(book.donor) && (
                    <span className="material-symbols-outlined text-primary text-[16px] material-icon-filled">
                      verified
                    </span>
                  )}
                </div>
                <p className="text-body-sm text-on-surface-variant">
                  {book.college_name} • Handover at {book.preferred_pickup_spot}
                </p>
              </div>

              {isDonor && (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/books/${book.id}/edit`}
                    className="h-9 px-3.5 rounded-lg bg-surface-container text-label-sm font-semibold flex items-center"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={handleDeleteListing}
                    className="h-9 px-3.5 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          <SafetyBanner mode="book_handover" />

          {/* Request Form for Non-Donor Students */}
          {!isDonor && book.availability_status === 'available' && !myExistingRequest && (
            <form
              onSubmit={handleRequestSubmit}
              className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-3.5"
            >
              <h2 className="text-title-md font-semibold text-on-surface">
                Request Campus Handover
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-label-sm text-on-surface mb-1">
                    Proposed Campus Safe Spot *
                  </label>
                  <input
                    type="text"
                    required
                    value={proposedSpot}
                    onChange={(e) => setProposedSpot(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                  />
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface mb-1">
                    Proposed Pickup Day &amp; Time *
                  </label>
                  <input
                    type="text"
                    required
                    value={proposedTime}
                    onChange={(e) => setProposedTime(e.target.value)}
                    placeholder="e.g., Tomorrow 1:15 PM Lunch Break"
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                  />
                </div>
              </div>

              {book.listing_type === 'exchange' && (
                <div>
                  <label className="block text-label-sm text-on-surface mb-1">
                    Book You Are Offering in Swap *
                  </label>
                  <input
                    type="text"
                    required
                    value={exchangeNote}
                    onChange={(e) => setExchangeNote(e.target.value)}
                    placeholder="State the textbook edition & condition you will bring..."
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                  />
                </div>
              )}

              <div>
                <label className="block text-label-sm text-on-surface mb-1">
                  Optional Note to Senior / Donor
                </label>
                <textarea
                  rows={2}
                  value={reqMessage}
                  onChange={(e) => setReqMessage(e.target.value)}
                  placeholder="Hi! Preparing for Sem exams and would love to pick this up..."
                  className="w-full p-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                />
              </div>

              <button
                type="submit"
                disabled={submittingReq}
                className="w-full h-11 rounded-xl bg-secondary text-on-secondary text-label-md font-semibold shadow-xs disabled:opacity-50"
              >
                {submittingReq ? 'Submitting Request...' : 'Submit Textbook Request'}
              </button>
            </form>
          )}

          {/* Participant Requests & Handover State Machine */}
          {requests.length > 0 && (
            <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-3">
              <h2 className="text-title-md font-semibold text-on-surface">
                {isDonor ? 'Incoming Student Requests & Handover' : 'Your Request & Handover Status'}
              </h2>

              <div className="space-y-3">
                {requests.map((req) => {
                  const busy = actionBusyId === req.id;
                  const activeReservation = ['accepted', 'reserved', 'handover_scheduled'].includes(
                    req.status
                  );
                  return (
                    <div key={req.id} className="p-4 rounded-xl bg-surface-container-low space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-label-md font-semibold text-on-surface">
                          {isDonor
                            ? req.requester?.full_name || 'Student Requester'
                            : `Donor: ${book.donor?.full_name || 'Senior'}`}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-label-sm text-on-surface capitalize">
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>

                      <p className="text-body-sm text-on-surface-variant">
                        Pickup: <strong>{req.proposed_spot}</strong> • <strong>{req.proposed_time}</strong>
                      </p>
                      {req.agreed_exchange_note && (
                        <p className="text-body-sm text-secondary">
                          Swap Offer: {req.agreed_exchange_note}
                        </p>
                      )}
                      {req.message && (
                        <p className="text-body-sm text-on-surface italic">“{req.message}”</p>
                      )}

                      {activeReservation && (
                        <div className="flex items-center gap-3 text-[12px] text-on-surface-variant pt-1">
                          <span>Donor Confirmed: {req.donor_confirmed ? 'Yes ✓' : 'Pending'}</span>
                          <span>•</span>
                          <span>
                            Requester Confirmed: {req.requester_confirmed ? 'Yes ✓' : 'Pending'}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {isDonor && req.status === 'pending' && book.availability_status === 'available' && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleTransition(req, 'accept')}
                              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold"
                            >
                              Accept &amp; Reserve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleTransition(req, 'decline')}
                              className="h-9 px-3.5 rounded-lg bg-surface-container text-on-surface text-label-sm font-semibold"
                            >
                              Decline
                            </button>
                          </>
                        )}

                        {activeReservation && (
                          <>
                            {req.status !== 'handover_scheduled' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleTransition(req, 'schedule_handover')}
                                className="h-9 px-3.5 rounded-lg bg-secondary text-on-secondary text-label-sm font-semibold"
                              >
                                Lock Handover Time
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={
                                busy ||
                                (isDonor && req.donor_confirmed) ||
                                (!isDonor && req.requester_confirmed)
                              }
                              onClick={() => handleTransition(req, 'confirm_handover')}
                              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-45"
                            >
                              Confirm Handover Complete
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenConversation(req.id)}
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
                            disabled={busy}
                            onClick={() => handleTransition(req, 'cancel')}
                            className="h-9 px-3.5 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="book_listing"
        targetTitle={book.title}
        targetUserId={book.donor_id}
        targetBookId={book.id}
      />
    </div>
  );
}
