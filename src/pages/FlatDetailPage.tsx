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
import { canDisplayCollegeVerifiedBadge } from '../lib/verification';
import type {
  AccommodationImage,
  AccommodationListing,
  Conversation,
  FlatRequest,
  ProfilePrivateContacts,
} from '../types/database';
import { ResilientImage } from '../components/ResilientImage';
import { SafetyBanner } from '../components/SafetyBanner';
import { ReportModal } from '../components/ReportModal';

const ROOM_LABELS: Record<AccommodationListing['room_type'], string> = {
  private_room: 'Private Room',
  shared_room: 'Shared Room',
  entire_flat: 'Entire Flat',
  studio_1rk: 'Studio / 1RK',
};

const PROPERTY_LABELS: Record<AccommodationListing['property_type'], string> = {
  apartment: 'Apartment / Shared Flat',
  independent_house: 'Independent House',
  pg_hostel: 'Student PG / Hostel',
  studio: 'Studio Unit',
};

export function FlatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, savedFlatIds, toggleSaveFlat } = useAuth();
  const { showToast } = useToast();

  const [flat, setFlat] = useState<AccommodationListing | null>(null);
  const [requests, setRequests] = useState<FlatRequest[]>([]);
  const [ownerContacts, setOwnerContacts] = useState<ProfilePrivateContacts | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);

  // Student Expression of Interest Form
  const [preferredMoveIn, setPreferredMoveIn] = useState<string>('');
  const [inquiryMessage, setInquiryMessage] = useState<string>('');
  const [submittingInquiry, setSubmittingInquiry] = useState<boolean>(false);

  // Owner Response Controls
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState<boolean>(false);

  const loadFlatDetails = useCallback(async () => {
    if (!id || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from('accommodation_listings')
      .select('*, owner:profiles!accommodation_listings_owner_id_fkey(*), images:accommodation_images(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      setFetchError(formatSupabaseError(error, 'Failed to load accommodation listing.'));
      setFlat(null);
      setLoading(false);
      return;
    }

    if (!data) {
      setFlat(null);
      setLoading(false);
      return;
    }

    const loaded = data as AccommodationListing;
    loaded.images = [...(loaded.images || [])].sort(
      (a: AccommodationImage, b: AccommodationImage) => a.display_order - b.display_order
    );
    setFlat(loaded);
    setPreferredMoveIn((prev) => prev || loaded.available_from);

    if (user) {
      const [reqsRes, contactsRes] = await Promise.all([
        supabase
          .from('flat_requests')
          .select('*, requester:profiles!flat_requests_requester_id_fkey(*)')
          .eq('listing_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profile_private_contacts')
          .select('*')
          .eq('user_id', loaded.owner_id)
          .maybeSingle(),
      ]);

      setRequests((reqsRes.data as FlatRequest[] | null) ?? []);
      setOwnerContacts((contactsRes.data as ProfilePrivateContacts | null) ?? null);
    } else {
      setRequests([]);
      setOwnerContacts(null);
    }

    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    loadFlatDetails();
  }, [loadFlatDetails]);

  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !flat) {
      navigate(`/auth?redirect=/flats/${id}`);
      return;
    }

    if (inquiryMessage.trim().length < 5) {
      showToast({
        variant: 'error',
        title: 'Message too short',
        description: 'Introduce yourself briefly (course, semester, move-in plan).',
      });
      return;
    }

    setSubmittingInquiry(true);
    try {
      const { error } = await supabase.from('flat_requests').insert({
        listing_id: flat.id,
        requester_id: user.id,
        owner_id: flat.owner_id,
        preferred_move_in: preferredMoveIn || flat.available_from,
        message: inquiryMessage.trim(),
      });

      if (error) throw new Error(formatSupabaseError(error));

      showToast({
        variant: 'success',
        title: 'Expression of Interest Sent',
        description: 'The listing host has been notified and can respond or open chat.',
      });
      setInquiryMessage('');
      await loadFlatDetails();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Could not send inquiry',
        description: formatSupabaseError(err),
      });
    } finally {
      setSubmittingInquiry(false);
    }
  };

  const handleRequestAction = async (
    req: FlatRequest,
    nextStatus: 'accepted' | 'declined' | 'cancelled'
  ) => {
    if (!user || !flat) return;
    setBusyRequestId(req.id);
    try {
      const updatePayload: Record<string, unknown> = { status: nextStatus };
      if (user.id === flat.owner_id && responseDrafts[req.id]?.trim()) {
        updatePayload.owner_response = responseDrafts[req.id].trim();
      }

      const { error } = await supabase
        .from('flat_requests')
        .update(updatePayload)
        .eq('id', req.id);

      if (error) throw new Error(formatSupabaseError(error));

      showToast({
        variant: 'success',
        title:
          nextStatus === 'accepted'
            ? 'Inquiry Accepted — Direct Chat Opened'
            : nextStatus === 'declined'
              ? 'Inquiry Declined'
              : 'Inquiry Cancelled',
      });
      await loadFlatDetails();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Could not update request',
        description: formatSupabaseError(err),
      });
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleToggleOccupied = async () => {
    if (!flat || !user || flat.owner_id !== user.id) return;
    const nextStatus = flat.status === 'occupied' ? 'published' : 'occupied';
    try {
      const { error } = await supabase
        .from('accommodation_listings')
        .update({
          status: nextStatus,
          spots_available: nextStatus === 'occupied' ? 0 : Math.max(1, flat.spots_available),
        })
        .eq('id', flat.id);
      if (error) throw new Error(formatSupabaseError(error));
      showToast({
        variant: 'info',
        title: nextStatus === 'occupied' ? 'Marked as Occupied' : 'Re-published Listing',
      });
      await loadFlatDetails();
    } catch (err) {
      showToast({ variant: 'error', title: 'Status update failed', description: formatSupabaseError(err) });
    }
  };

  const handleDeleteListing = async () => {
    if (!flat || !user || flat.owner_id !== user.id) return;
    try {
      const paths = (flat.images || []).map((img) => img.storage_path);
      await deleteStoragePaths('accommodations', paths);
      const { error } = await supabase.from('accommodation_listings').delete().eq('id', flat.id);
      if (error) throw new Error(formatSupabaseError(error));
      showToast({ variant: 'info', title: 'Accommodation listing deleted' });
      navigate('/flats');
    } catch (err) {
      showToast({ variant: 'error', title: 'Delete failed', description: formatSupabaseError(err) });
    }
  };

  const handleOpenChat = async (requestId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('context_type', 'flat_request')
      .eq('context_id', requestId)
      .maybeSingle();

    if (data) {
      navigate(`/messages/${(data as Pick<Conversation, 'id'>).id}`);
    } else {
      navigate('/messages');
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="h-80 rounded-2xl bg-surface-container animate-pulse" />
        <div className="h-48 rounded-2xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-3">
        <h1 className="text-headline-sm text-on-surface font-bold">Could Not Load Listing</h1>
        <p className="text-body-sm text-error">{fetchError}</p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={loadFlatDetails}
            className="h-9 px-4 rounded-xl bg-primary text-on-primary text-label-sm font-semibold"
          >
            Retry
          </button>
          <Link to="/flats" className="text-label-md text-primary font-semibold inline-block">
            ← Browse Available Flats
          </Link>
        </div>
      </div>
    );
  }

  if (!flat) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-3">
        <h1 className="text-headline-sm text-on-surface font-bold">Listing Not Found</h1>
        <p className="text-body-sm text-on-surface-variant">
          This accommodation listing may have been removed or is not yet published.
        </p>
        <Link to="/flats" className="text-label-md text-primary font-semibold inline-block">
          ← Browse Available Flats
        </Link>
      </div>
    );
  }

  const isOwner = user?.id === flat.owner_id;
  const isSaved = savedFlatIds.has(flat.id);
  const ownerVerified = canDisplayCollegeVerifiedBadge(flat.owner);
  const myActiveRequest = requests.find(
    (r) => r.requester_id === user?.id && ['pending', 'accepted'].includes(r.status)
  );
  const images = flat.images || [];
  const activeImage = images[activePhotoIdx]?.public_url || null;

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 space-y-6">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2">
        <Link to="/flats" className="text-label-md text-primary font-semibold flex items-center gap-1">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Back to Flats</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!user) return navigate(`/auth?redirect=/flats/${flat.id}`);
              await toggleSaveFlat(flat.id);
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

          {!isOwner && (
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
        {/* Left Column: Gallery, Details, Amenities, Rules */}
        <div className="lg:col-span-7 space-y-5">
          {/* Gallery */}
          <div className="space-y-2.5">
            <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden bg-surface-container-lowest shadow-xs">
              <ResilientImage
                src={activeImage}
                alt={flat.title}
                fallbackIcon="apartment"
                fallbackLabel={`${flat.locality}, ${flat.city}`}
              />
              {images.length > 0 && (
                <div className="absolute bottom-3 right-3 bg-inverse-surface/80 text-inverse-on-surface px-2.5 py-1 rounded-lg text-label-sm tabular-nums">
                  {activePhotoIdx + 1} / {images.length}
                </div>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {images.map((img, idx) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActivePhotoIdx(idx)}
                    className={`w-20 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                      idx === activePhotoIdx ? 'border-primary' : 'border-transparent opacity-75'
                    }`}
                  >
                    <img
                      src={img.public_url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Core Specs Card */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-label-sm font-semibold">
                {ROOM_LABELS[flat.room_type]}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface text-label-sm">
                {PROPERTY_LABELS[flat.property_type]}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-label-sm capitalize">
                Status: {flat.status}
              </span>
            </div>

            <div>
              <h1 className="text-headline-md text-on-surface font-bold">{flat.title}</h1>
              <p className="text-body-md text-on-surface-variant mt-0.5">
                {flat.locality}, {flat.city}
                {flat.address_line ? ` • ${flat.address_line}` : ''}
              </p>
            </div>

            {/* Campus Commute Box */}
            <div className="p-3.5 rounded-xl bg-surface-container-low flex items-start gap-2.5">
              <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">
                school
              </span>
              <div className="text-body-sm">
                <p className="font-semibold text-on-surface">
                  {flat.distance_km !== null && flat.distance_km !== undefined
                    ? `${flat.distance_km} km from ${flat.nearby_college}`
                    : `Near ${flat.nearby_college}`}
                </p>
                {flat.transport_note && (
                  <p className="text-on-surface-variant mt-0.5">{flat.transport_note}</p>
                )}
              </div>
            </div>

            {flat.description && (
              <div>
                <h2 className="text-title-md font-semibold text-on-surface mb-1">
                  About This Stay
                </h2>
                <p className="text-body-md text-on-surface-variant whitespace-pre-line leading-relaxed">
                  {flat.description}
                </p>
              </div>
            )}

            {/* Amenities */}
            {flat.amenities && flat.amenities.length > 0 && (
              <div>
                <h2 className="text-title-md font-semibold text-on-surface mb-2">Amenities</h2>
                <div className="flex flex-wrap gap-2">
                  {flat.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface text-label-sm flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[15px] text-primary">
                        check_circle
                      </span>
                      <span>{amenity}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* House Rules */}
            {flat.house_rules && flat.house_rules.length > 0 && (
              <div>
                <h2 className="text-title-md font-semibold text-on-surface mb-2">House Rules</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-body-sm text-on-surface-variant">
                  {flat.house_rules.map((rule) => (
                    <li key={rule} className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-secondary">
                        rule
                      </span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <SafetyBanner mode="housing" />
        </div>

        {/* Right Column: Rent Summary, Host Card, Inquiry Form / Owner Management */}
        <div className="lg:col-span-5 space-y-4">
          {/* Pricing & Availability Card */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-baseline justify-between border-b border-surface-container pb-3">
              <div>
                <span className="text-headline-lg text-primary font-bold tabular-nums">
                  ₹{flat.rent_monthly.toLocaleString('en-IN')}
                </span>
                <span className="text-body-sm text-on-surface-variant"> / month</span>
              </div>
              <div className="text-right">
                <span className="text-label-sm text-outline block">Refundable Deposit</span>
                <span className="text-title-md font-semibold text-on-surface tabular-nums">
                  ₹{flat.deposit_amount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-body-sm">
              <div className="p-2.5 rounded-xl bg-surface-container-low">
                <span className="text-outline text-[11px] uppercase font-semibold block">
                  Available From
                </span>
                <span className="font-semibold text-on-surface">
                  {new Date(flat.available_from).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-container-low">
                <span className="text-outline text-[11px] uppercase font-semibold block">
                  Vacancy
                </span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {flat.spots_available} of {flat.spots_total} spot{flat.spots_total > 1 ? 's' : ''} open
                </span>
              </div>
            </div>

            {/* Host Identity Card */}
            <div className="p-3.5 rounded-xl bg-surface-container-low space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-label-md font-semibold text-on-surface">
                      Listed by {flat.owner?.full_name || 'Campus Student'}
                    </span>
                    {ownerVerified && (
                      <span
                        title="College Verified Student"
                        className="material-symbols-outlined text-[16px] text-primary material-icon-filled"
                      >
                        verified
                      </span>
                    )}
                  </div>
                  <p className="text-body-sm text-on-surface-variant">
                    {flat.owner?.college_name || flat.nearby_college}
                    {flat.owner?.course ? ` • ${flat.owner.course}` : ''}
                  </p>
                </div>
              </div>

              {/* RLS-Protected Private Contact Info */}
              {ownerContacts && (ownerContacts.phone_number || ownerContacts.whatsapp_number) ? (
                <div className="pt-2 border-t border-outline-variant/25 text-body-sm space-y-1">
                  <p className="text-label-sm text-primary font-semibold">
                    Verified Contact Unlocked:
                  </p>
                  {ownerContacts.phone_number && <p>Phone: {ownerContacts.phone_number}</p>}
                  {ownerContacts.whatsapp_number && <p>WhatsApp: {ownerContacts.whatsapp_number}</p>}
                  <p className="text-[12px] text-outline">
                    Preferred hours: {ownerContacts.preferred_contact_hours}
                  </p>
                </div>
              ) : (
                !isOwner && (
                  <p className="text-[12px] text-outline pt-1">
                    Private phone/WhatsApp details are protected and unlock automatically once the
                    host accepts your inquiry.
                  </p>
                )
              )}
            </div>

            {/* Owner Controls */}
            {isOwner && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  to={`/flats/${flat.id}/edit`}
                  className="flex-1 h-10 px-3 rounded-xl bg-primary text-on-primary text-label-sm font-semibold flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Edit Listing</span>
                </Link>
                <button
                  type="button"
                  onClick={handleToggleOccupied}
                  className="h-10 px-3.5 rounded-xl bg-surface-container text-on-surface text-label-sm font-semibold"
                >
                  {flat.status === 'occupied' ? 'Mark Available' : 'Mark Occupied'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteListing}
                  className="h-10 px-3.5 rounded-xl bg-error-container text-on-error-container text-label-sm font-semibold"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Student Expression of Interest Form */}
          {!isOwner && flat.status === 'published' && !myActiveRequest && (
            <form
              onSubmit={handleSubmitInquiry}
              className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-3.5"
            >
              <h2 className="text-title-md font-semibold text-on-surface">
                Express Interest in This Room
              </h2>

              <div>
                <label className="block text-label-sm text-on-surface mb-1">
                  Preferred Move-in Date *
                </label>
                <input
                  type="date"
                  required
                  value={preferredMoveIn}
                  onChange={(e) => setPreferredMoveIn(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                />
              </div>

              <div>
                <label className="block text-label-sm text-on-surface mb-1">
                  Intro Message to Host *
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  placeholder="Share your college, branch/year, routine, and when you can visit the flat..."
                  className="w-full p-3 rounded-xl bg-surface-container-low text-body-md text-on-surface"
                />
              </div>

              <button
                type="submit"
                disabled={submittingInquiry}
                className="w-full h-11 rounded-xl bg-primary text-on-primary text-label-md font-semibold shadow-xs disabled:opacity-50"
              >
                {submittingInquiry ? 'Sending Inquiry...' : 'Send Room Inquiry'}
              </button>
            </form>
          )}

          {/* Inquiries List (Owner Incoming or Student's Own Request) */}
          {requests.length > 0 && (
            <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs space-y-3">
              <h2 className="text-title-md font-semibold text-on-surface">
                {isOwner ? `Student Inquiries (${requests.length})` : 'Your Room Inquiry'}
              </h2>

              <div className="space-y-3">
                {requests.map((req) => {
                  const busy = busyRequestId === req.id;
                  return (
                    <div key={req.id} className="p-3.5 rounded-xl bg-surface-container-low space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-label-md font-semibold text-on-surface">
                          {isOwner
                            ? req.requester?.full_name || 'Campus Student'
                            : 'Status with Host'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-label-sm text-on-surface capitalize">
                          {req.status}
                        </span>
                      </div>

                      {isOwner && req.requester && (
                        <p className="text-[12px] text-on-surface-variant">
                          {req.requester.college_name} • {req.requester.course}{' '}
                          {req.requester.department}
                        </p>
                      )}

                      <p className="text-body-sm text-on-surface-variant">
                        Move-in target:{' '}
                        <strong>
                          {new Date(req.preferred_move_in).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </strong>
                      </p>
                      <p className="text-body-sm text-on-surface">“{req.message}”</p>

                      {req.owner_response && (
                        <p className="text-body-sm text-primary bg-surface-container-lowest p-2.5 rounded-lg">
                          <strong>Host Reply:</strong> {req.owner_response}
                        </p>
                      )}

                      {isOwner && req.status === 'pending' && (
                        <div className="space-y-2 pt-1">
                          <input
                            type="text"
                            value={responseDrafts[req.id] || ''}
                            onChange={(e) =>
                              setResponseDrafts((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            placeholder="Optional note (e.g., Visit Saturday 5 PM)"
                            className="w-full h-9 px-3 rounded-lg bg-surface-container-lowest text-body-sm text-on-surface"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRequestAction(req, 'accepted')}
                              className="flex-1 h-9 rounded-lg bg-primary text-on-primary text-label-sm font-semibold"
                            >
                              Accept &amp; Open Chat
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRequestAction(req, 'declined')}
                              className="h-9 px-3.5 rounded-lg bg-surface-container text-on-surface text-label-sm font-semibold"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {req.status === 'accepted' && (
                          <button
                            type="button"
                            onClick={() => handleOpenChat(req.id)}
                            className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[16px]">chat</span>
                            <span>Message</span>
                          </button>
                        )}
                        {!isOwner && ['pending', 'accepted'].includes(req.status) && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRequestAction(req, 'cancelled')}
                            className="h-9 px-3.5 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                          >
                            Cancel Inquiry
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
        targetType="flat_listing"
        targetTitle={flat.title}
        targetUserId={flat.owner_id}
        targetFlatId={flat.id}
      />
    </div>
  );
}
