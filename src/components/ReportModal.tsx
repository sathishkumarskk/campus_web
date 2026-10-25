import React, { useState } from 'react';
import { formatSupabaseError, supabase } from '../lib/supabase';
import { validateReportPayload } from '../lib/validators';
import type { ReportCategory, ReportTargetType } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetTitle: string;
  targetUserId?: string | null;
  targetFlatId?: string | null;
  targetBookId?: string | null;
}

const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: 'broker_spam', label: 'Broker / Commercial Brokerage Spam' },
  { value: 'paid_book_violation', label: 'Demanding Money for Free Donation Book' },
  { value: 'fake_listing', label: 'Fake or Misleading Photos / Details' },
  { value: 'harassment', label: 'Harassment or Abusive Conduct' },
  { value: 'unsafe_behavior', label: 'Unsafe Handover / Property Visit Request' },
  { value: 'inaccurate_info', label: 'Already Occupied / Inaccurate Availability' },
  { value: 'other', label: 'Other Community Policy Concern' },
];

export function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetTitle,
  targetUserId = null,
  targetFlatId = null,
  targetBookId = null,
}: ReportModalProps) {
  const { user, blockUser } = useAuth();
  const { showToast } = useToast();
  const [category, setCategory] = useState<ReportCategory>('fake_listing');
  const [description, setDescription] = useState('');
  const [alsoBlockUser, setAlsoBlockUser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError('Please sign in to submit a safety report.');
      return;
    }

    const validationErr = validateReportPayload({ category, description });
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setSubmitting(true);
    try {
      const { error: insertErr } = await supabase.from('user_reports').insert({
        reporter_id: user.id,
        target_type: targetType,
        target_user_id: targetUserId,
        target_flat_id: targetFlatId,
        target_book_id: targetBookId,
        category,
        description: description.trim(),
      });

      if (insertErr) {
        throw new Error(formatSupabaseError(insertErr, 'Could not submit report.'));
      }

      if (alsoBlockUser && targetUserId && targetUserId !== user.id) {
        await blockUser(targetUserId, `Blocked with report: ${category}`);
      }

      showToast({
        variant: 'success',
        title: 'Safety Report Submitted',
        description: 'CampusCircle moderators will review this report promptly.',
      });
      setDescription('');
      setAlsoBlockUser(false);
      onClose();
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-[65] bg-inverse-surface/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">flag</span>
            </div>
            <div>
              <h2 id="report-modal-title" className="text-title-md text-on-surface font-semibold">
                Report to Moderation
              </h2>
              <p className="text-body-sm text-on-surface-variant line-clamp-1">{targetTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report modal"
            className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="report-category" className="block text-label-sm text-on-surface mb-1">
              Issue Category
            </label>
            <select
              id="report-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {REPORT_CATEGORIES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="report-desc" className="block text-label-sm text-on-surface mb-1">
              What happened?
            </label>
            <textarea
              id="report-desc"
              rows={3}
              required
              minLength={10}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide factual details so campus moderators can investigate..."
              className="w-full p-3 rounded-xl bg-surface-container-low text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {targetUserId && user?.id !== targetUserId && (
            <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-container-low cursor-pointer">
              <input
                type="checkbox"
                checked={alsoBlockUser}
                onChange={(e) => setAlsoBlockUser(e.target.checked)}
                className="w-4 h-4 accent-primary rounded"
              />
              <span className="text-body-sm text-on-surface">
                Also block this user from messaging or sending requests to me
              </span>
            </label>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-error-container text-on-error-container text-body-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl bg-surface-container text-on-surface text-label-md font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 px-4 rounded-xl bg-error text-on-error text-label-md font-semibold disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
