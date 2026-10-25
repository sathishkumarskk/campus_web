import React, { useCallback, useEffect, useState } from 'react';
import { formatSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import type {
  AccommodationListing,
  BookListing,
  CollegeVerificationRequest,
  ModerationAction,
  ModerationActionType,
  Profile,
  UserReport,
} from '../types/database';

type ModTab = 'verifications' | 'reports' | 'entities' | 'audit';

export function AdminModerationPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<ModTab>('verifications');

  const [verifications, setVerifications] = useState<CollegeVerificationRequest[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [flats, setFlats] = useState<AccommodationListing[]>([]);
  const [books, setBooks] = useState<BookListing[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [auditLogs, setAuditLogs] = useState<ModerationAction[]>([]);

  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [signedIdUrls, setSignedIdUrls] = useState<Record<string, string>>({});

  const loadModerationQueues = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [verifRes, reportRes, flatsRes, booksRes, usersRes, auditRes] = await Promise.all([
        supabase
          .from('college_verification_requests')
          .select('*, user:profiles!college_verification_requests_user_id_fkey(*)')
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('user_reports')
          .select(
            '*, reporter:profiles!user_reports_reporter_id_fkey(*), target_user:profiles!user_reports_target_user_id_fkey(*)'
          )
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('accommodation_listings')
          .select('*, owner:profiles!accommodation_listings_owner_id_fkey(*)')
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('book_listings')
          .select('*, donor:profiles!book_listings_donor_id_fkey(*)')
          .order('created_at', { ascending: false })
          .limit(40),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(50),
        supabase
          .from('moderation_actions')
          .select('*, admin:profiles!moderation_actions_admin_id_fkey(*)')
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      setVerifications((verifRes.data as CollegeVerificationRequest[] | null) ?? []);
      setReports((reportRes.data as UserReport[] | null) ?? []);
      setFlats((flatsRes.data as AccommodationListing[] | null) ?? []);
      setBooks((booksRes.data as BookListing[] | null) ?? []);
      setUsers((usersRes.data as Profile[] | null) ?? []);
      setAuditLogs((auditRes.data as ModerationAction[] | null) ?? []);
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Failed to load moderation console',
        description: formatSupabaseError(err),
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadModerationQueues();
  }, [loadModerationQueues]);

  const handleInspectIdCard = async (req: CollegeVerificationRequest) => {
    try {
      const { data, error } = await supabase.storage
        .from('verification-docs')
        .createSignedUrl(req.id_card_storage_path, 300);
      if (error || !data?.signedUrl) {
        throw new Error(formatSupabaseError(error, 'Could not generate signed document URL.'));
      }
      setSignedIdUrls((prev) => ({ ...prev, [req.id]: data.signedUrl }));
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Document preview failed',
        description: formatSupabaseError(err),
      });
    }
  };

  const executeModerationRpc = async (params: {
    keyId: string;
    actionType: ModerationActionType;
    targetUserId?: string | null;
    targetEntityId?: string | null;
    defaultReason?: string;
  }) => {
    const reason = (reasonDrafts[params.keyId] || params.defaultReason || '').trim();
    if (reason.length < 3) {
      showToast({
        variant: 'error',
        title: 'Moderation reason required',
        description: 'Enter at least 3 characters for the immutable audit log.',
      });
      return;
    }

    setBusyId(params.keyId);
    try {
      const { error } = await supabase.rpc('perform_moderation_action', {
        p_action_type: params.actionType,
        p_target_user_id: params.targetUserId ?? null,
        p_target_entity_id: params.targetEntityId ?? null,
        p_reason: reason,
      });

      if (error) throw new Error(formatSupabaseError(error));

      showToast({
        variant: 'success',
        title: 'Moderation Action Recorded',
        description: `Executed ${params.actionType.replace(/_/g, ' ')}.`,
      });
      await loadModerationQueues();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Moderation action failed',
        description: formatSupabaseError(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const pendingVerificationsCount = verifications.filter((v) => v.status === 'pending').length;
  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="text-label-sm font-semibold uppercase tracking-wider text-tertiary">
            CampusCircle Trust &amp; Safety
          </span>
          <h1 className="text-headline-md text-on-surface font-bold">
            Administrator Moderation Console
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Review college ID cards, triage safety reports, moderate listings, and audit privileged
            actions.
          </p>
        </div>

        <button
          type="button"
          onClick={loadModerationQueues}
          className="h-10 px-4 rounded-xl bg-surface-container-lowest text-label-md font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          <span>Refresh Queues</span>
        </button>
      </div>

      {/* Tab Selector */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 bg-surface-container-low rounded-xl">
        <button
          type="button"
          onClick={() => setActiveTab('verifications')}
          className={`px-3.5 py-2 rounded-lg text-label-md font-semibold shrink-0 ${
            activeTab === 'verifications'
              ? 'bg-surface-container-lowest text-primary shadow-xs'
              : 'text-on-surface-variant'
          }`}
        >
          ID Verifications ({pendingVerificationsCount} pending)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`px-3.5 py-2 rounded-lg text-label-md font-semibold shrink-0 ${
            activeTab === 'reports'
              ? 'bg-surface-container-lowest text-primary shadow-xs'
              : 'text-on-surface-variant'
          }`}
        >
          Safety Reports ({openReportsCount} open)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('entities')}
          className={`px-3.5 py-2 rounded-lg text-label-md font-semibold shrink-0 ${
            activeTab === 'entities'
              ? 'bg-surface-container-lowest text-primary shadow-xs'
              : 'text-on-surface-variant'
          }`}
        >
          Listings &amp; Users
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-3.5 py-2 rounded-lg text-label-md font-semibold shrink-0 ${
            activeTab === 'audit'
              ? 'bg-surface-container-lowest text-primary shadow-xs'
              : 'text-on-surface-variant'
          }`}
        >
          Audit Log ({auditLogs.length})
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-32 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* 1. COLLEGE ID VERIFICATION QUEUE */}
          {activeTab === 'verifications' && (
            <div className="space-y-3">
              {verifications.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-body-md text-on-surface-variant">
                  No college ID verification requests submitted yet.
                </div>
              ) : (
                verifications.map((req) => (
                  <div
                    key={req.id}
                    className="bg-surface-container-lowest rounded-xl p-4 shadow-xs space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-title-md font-semibold text-on-surface">
                          {req.user?.full_name || 'Student'} ({req.user?.email})
                        </p>
                        <p className="text-body-sm text-on-surface-variant">
                          College: <strong>{req.college_name}</strong> • Roll No:{' '}
                          <strong>{req.student_roll_number}</strong>
                          {req.college_email ? ` • Institutional Email: ${req.college_email}` : ''}
                        </p>
                      </div>
                      <span className="text-label-sm font-semibold capitalize text-on-surface-variant">
                        Status: {req.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleInspectIdCard(req)}
                        className="h-9 px-3.5 rounded-lg bg-surface-container text-on-surface text-label-sm font-semibold flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">badge</span>
                        <span>Load Temporary Signed ID Preview</span>
                      </button>

                      {signedIdUrls[req.id] && (
                        <a
                          href={signedIdUrls[req.id]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-label-sm text-primary font-semibold underline"
                        >
                          Open Signed Document (Expires in 5m) ↗
                        </a>
                      )}
                    </div>

                    {signedIdUrls[req.id] && !req.id_card_storage_path.endsWith('.pdf') && (
                      <img
                        src={signedIdUrls[req.id]}
                        alt="Submitted Student ID Card"
                        className="max-h-60 rounded-xl border border-outline-variant/30 object-contain bg-surface-container-low"
                      />
                    )}

                    {req.status === 'pending' && (
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <input
                          type="text"
                          value={reasonDrafts[req.id] || ''}
                          onChange={(e) =>
                            setReasonDrafts((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          placeholder="Verification review note (e.g., Valid Anna Univ 2026 ID card)"
                          className="flex-1 h-10 px-3 rounded-lg bg-surface-container-low text-body-sm text-on-surface"
                        />
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() =>
                            executeModerationRpc({
                              keyId: req.id,
                              actionType: 'approve_verification',
                              targetUserId: req.user_id,
                              targetEntityId: req.id,
                              defaultReason: 'Verified valid college student ID card',
                            })
                          }
                          className="h-10 px-4 rounded-lg bg-primary text-on-primary text-label-sm font-semibold"
                        >
                          Approve ID ✓
                        </button>
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() =>
                            executeModerationRpc({
                              keyId: req.id,
                              actionType: 'reject_verification',
                              targetUserId: req.user_id,
                              targetEntityId: req.id,
                            })
                          }
                          className="h-10 px-4 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* 2. USER & LISTING SAFETY REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-3">
              {reports.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-body-md text-on-surface-variant">
                  No safety reports in queue.
                </div>
              ) : (
                reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="bg-surface-container-lowest rounded-xl p-4 shadow-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold uppercase text-error">
                          {rep.category.replace(/_/g, ' ')} • Target: {rep.target_type}
                        </span>
                        <p className="text-body-md text-on-surface font-medium mt-0.5">
                          “{rep.description}”
                        </p>
                        <p className="text-[12px] text-on-surface-variant mt-1">
                          Reporter: {rep.reporter?.full_name || rep.reporter_id} • Reported User:{' '}
                          {rep.target_user?.full_name || rep.target_user_id || 'N/A'}
                        </p>
                      </div>
                      <span className="text-label-sm font-semibold capitalize text-on-surface-variant">
                        {rep.status}
                      </span>
                    </div>

                    {rep.status === 'open' && (
                      <div className="space-y-2 pt-1">
                        <input
                          type="text"
                          value={reasonDrafts[rep.id] || ''}
                          onChange={(e) =>
                            setReasonDrafts((prev) => ({ ...prev, [rep.id]: e.target.value }))
                          }
                          placeholder="Resolution / enforcement reason (required for audit log)..."
                          className="w-full h-10 px-3 rounded-lg bg-surface-container-low text-body-sm text-on-surface"
                        />

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyId === rep.id}
                            onClick={() =>
                              executeModerationRpc({
                                keyId: rep.id,
                                actionType: 'resolve_report',
                                targetUserId: rep.target_user_id,
                                targetEntityId: rep.id,
                              })
                            }
                            className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold"
                          >
                            Mark Resolved
                          </button>

                          <button
                            type="button"
                            disabled={busyId === rep.id}
                            onClick={() =>
                              executeModerationRpc({
                                keyId: rep.id,
                                actionType: 'dismiss_report',
                                targetUserId: rep.target_user_id,
                                targetEntityId: rep.id,
                              })
                            }
                            className="h-9 px-3.5 rounded-lg bg-surface-container text-on-surface text-label-sm font-semibold"
                          >
                            Dismiss
                          </button>

                          {rep.target_flat_id && (
                            <button
                              type="button"
                              disabled={busyId === rep.id}
                              onClick={() =>
                                executeModerationRpc({
                                  keyId: rep.id,
                                  actionType: 'remove_flat_listing',
                                  targetUserId: rep.target_user_id,
                                  targetEntityId: rep.target_flat_id,
                                })
                              }
                              className="h-9 px-3.5 rounded-lg bg-error text-on-error text-label-sm font-semibold"
                            >
                              Remove Flat Listing
                            </button>
                          )}

                          {rep.target_book_id && (
                            <button
                              type="button"
                              disabled={busyId === rep.id}
                              onClick={() =>
                                executeModerationRpc({
                                  keyId: rep.id,
                                  actionType: 'remove_book_listing',
                                  targetUserId: rep.target_user_id,
                                  targetEntityId: rep.target_book_id,
                                })
                              }
                              className="h-9 px-3.5 rounded-lg bg-error text-on-error text-label-sm font-semibold"
                            >
                              Remove Book Listing
                            </button>
                          )}

                          {rep.target_user_id && (
                            <button
                              type="button"
                              disabled={busyId === rep.id}
                              onClick={() =>
                                executeModerationRpc({
                                  keyId: rep.id,
                                  actionType: 'suspend_user',
                                  targetUserId: rep.target_user_id,
                                })
                              }
                              className="h-9 px-3.5 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                            >
                              Suspend User
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* 3. LISTINGS & USERS CONTROL */}
          {activeTab === 'entities' && (
            <div className="space-y-6">
              <section className="space-y-2.5">
                <h2 className="text-title-md font-semibold text-on-surface">
                  Student Accounts ({users.length})
                </h2>
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="bg-surface-container-lowest rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-label-md font-semibold text-on-surface">
                        {u.full_name} ({u.email}) · Role: {u.role}
                        {u.is_suspended ? ' · SUSPENDED' : ''}
                      </p>
                      <p className="text-[12px] text-on-surface-variant">
                        {u.college_name || 'No college'} • Verified: {u.college_verified ? 'Yes' : 'No'}
                      </p>
                    </div>
                    {u.role !== 'admin' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={reasonDrafts[u.id] || ''}
                          onChange={(e) =>
                            setReasonDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                          placeholder="Reason..."
                          className="h-9 px-2.5 rounded-lg bg-surface-container-low text-body-sm"
                        />
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() =>
                            executeModerationRpc({
                              keyId: u.id,
                              actionType: u.is_suspended ? 'restore_user' : 'suspend_user',
                              targetUserId: u.id,
                            })
                          }
                          className={`h-9 px-3 rounded-lg text-label-sm font-semibold ${
                            u.is_suspended
                              ? 'bg-primary text-on-primary'
                              : 'bg-error-container text-on-error-container'
                          }`}
                        >
                          {u.is_suspended ? 'Restore' : 'Suspend'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              <section className="space-y-2.5">
                <h2 className="text-title-md font-semibold text-on-surface">
                  Accommodation Listings ({flats.length})
                </h2>
                {flats.map((f) => (
                  <div
                    key={f.id}
                    className="bg-surface-container-lowest rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-label-md font-semibold text-on-surface">
                        {f.title} · <span className="capitalize">{f.status}</span>
                      </p>
                      <p className="text-[12px] text-on-surface-variant">
                        Host: {f.owner?.full_name} • ₹{f.rent_monthly.toLocaleString('en-IN')}/mo
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={reasonDrafts[f.id] || ''}
                        onChange={(e) =>
                          setReasonDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        placeholder="Reason..."
                        className="h-9 px-2.5 rounded-lg bg-surface-container-low text-body-sm"
                      />
                      <button
                        type="button"
                        disabled={busyId === f.id}
                        onClick={() =>
                          executeModerationRpc({
                            keyId: f.id,
                            actionType:
                              f.status === 'removed'
                                ? 'restore_flat_listing'
                                : 'remove_flat_listing',
                            targetUserId: f.owner_id,
                            targetEntityId: f.id,
                          })
                        }
                        className="h-9 px-3 rounded-lg bg-surface-container text-label-sm font-semibold"
                      >
                        {f.status === 'removed' ? 'Restore' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ))}
              </section>

              <section className="space-y-2.5">
                <h2 className="text-title-md font-semibold text-on-surface">
                  BookBridge Listings ({books.length})
                </h2>
                {books.map((b) => (
                  <div
                    key={b.id}
                    className="bg-surface-container-lowest rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-label-md font-semibold text-on-surface">
                        {b.title} · <span className="capitalize">{b.availability_status}</span>
                      </p>
                      <p className="text-[12px] text-on-surface-variant">
                        Donor: {b.donor?.full_name} • {b.department} Sem {b.semester}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={reasonDrafts[b.id] || ''}
                        onChange={(e) =>
                          setReasonDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))
                        }
                        placeholder="Reason..."
                        className="h-9 px-2.5 rounded-lg bg-surface-container-low text-body-sm"
                      />
                      <button
                        type="button"
                        disabled={busyId === b.id}
                        onClick={() =>
                          executeModerationRpc({
                            keyId: b.id,
                            actionType:
                              b.availability_status === 'removed'
                                ? 'restore_book_listing'
                                : 'remove_book_listing',
                            targetUserId: b.donor_id,
                            targetEntityId: b.id,
                          })
                        }
                        className="h-9 px-3 rounded-lg bg-surface-container text-label-sm font-semibold"
                      >
                        {b.availability_status === 'removed' ? 'Restore' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}

          {/* 4. IMMUTABLE AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="space-y-2.5">
              {auditLogs.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-body-md text-on-surface-variant">
                  No moderation actions recorded yet.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-surface-container-lowest rounded-xl p-3.5 shadow-xs flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-label-md font-semibold text-on-surface capitalize">
                        {log.action_type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-body-sm text-on-surface-variant">Reason: {log.reason}</p>
                      <p className="text-[11px] text-outline">
                        Admin: {log.admin?.full_name || log.admin_id}
                      </p>
                    </div>
                    <span className="text-[12px] text-outline shrink-0 tabular-nums">
                      {new Date(log.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
