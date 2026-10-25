import { describe, expect, it } from 'vitest';
import { calculateFlatmateCompatibility } from '../lib/compatibility';
import {
  canPerformBookRequestAction,
  isActiveBookReservationStatus,
  validateBookListingPayload,
} from '../lib/bookStateMachine';
import {
  calculateProfileCompletion,
  canDisplayCollegeVerifiedBadge,
  extractEmailDomain,
  isInstitutionalCollegeEmail,
} from '../lib/verification';
import {
  formatSupabaseError,
  isMissingSchemaError,
  MAX_UPLOAD_BYTES,
  validateSupabaseConfig,
  validateUploadFile,
} from '../lib/supabase';
import {
  validateAccommodationPayload,
  validateProfilePayload,
  validateReportPayload,
} from '../lib/validators';
import type { StudentPreferences } from '../types/database';

function makePrefs(overrides: Partial<StudentPreferences> = {}): StudentPreferences {
  return {
    user_id: 'user-1',
    hunt_status: 'seeking_flat_and_flatmate',
    headline: 'Seeking 2BHK near Guindy',
    budget_min: 6000,
    budget_max: 8500,
    preferred_city: 'Chennai',
    preferred_localities: ['Velachery', 'Adyar'],
    move_in_date: '2026-07-01',
    diet: 'vegetarian',
    sleep_schedule: 'early_riser',
    cleanliness: 'very_tidy',
    smoking: 'no',
    alcohol: 'no',
    study_habit: 'quiet_hours',
    guest_policy: 'occasional',
    hobbies: ['Coding', 'Badminton'],
    book_interests: ['Operating Systems'],
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('FlatMate Deterministic Compatibility Engine', () => {
  it('awards 100 points and 7/7 exact matches when preferences and college align', () => {
    const prefsA = makePrefs({ user_id: 'u1' });
    const prefsB = makePrefs({ user_id: 'u2' });

    const result = calculateFlatmateCompatibility(
      prefsA,
      { city: 'Chennai', college_name: 'Anna University' },
      prefsB,
      { city: 'Chennai', college_name: 'Anna University' }
    );

    expect(result.score).toBe(100);
    expect(result.matchedFactorsCount).toBe(7);
    expect(result.totalFactorsCount).toBe(7);
    expect(result.differences).toHaveLength(0);
  });

  it('is symmetric and deterministic across contrasting routines and budgets', () => {
    const prefsA = makePrefs({
      diet: 'vegan',
      smoking: 'no',
      alcohol: 'no',
      sleep_schedule: 'early_riser',
      cleanliness: 'very_tidy',
      budget_min: 5000,
      budget_max: 6500,
      guest_policy: 'no_overnight',
      preferred_city: 'Chennai',
    });

    const prefsB = makePrefs({
      diet: 'non_vegetarian',
      smoking: 'yes',
      alcohol: 'yes',
      sleep_schedule: 'night_owl',
      study_habit: 'collaborative',
      cleanliness: 'relaxed',
      budget_min: 12000,
      budget_max: 15000,
      guest_policy: 'open',
      preferred_city: 'Bengaluru',
    });

    const ab = calculateFlatmateCompatibility(
      prefsA,
      { city: 'Chennai', college_name: 'IIT Madras' },
      prefsB,
      { city: 'Bengaluru', college_name: 'IISc' }
    );
    const ba = calculateFlatmateCompatibility(
      prefsB,
      { city: 'Bengaluru', college_name: 'IISc' },
      prefsA,
      { city: 'Chennai', college_name: 'IIT Madras' }
    );

    expect(ab.score).toBe(ba.score);
    expect(ab.score).toBeLessThan(25);
    expect(ab.differences.length).toBeGreaterThanOrEqual(5);
  });

  it('gives partial budget points when budget ranges are within ₹1,500', () => {
    const prefsA = makePrefs({ budget_min: 6000, budget_max: 7000 });
    const prefsB = makePrefs({ budget_min: 8000, budget_max: 9500 }); // ₹1,000 gap

    const res = calculateFlatmateCompatibility(
      prefsA,
      { city: 'Chennai', college_name: 'Anna University' },
      prefsB,
      { city: 'Chennai', college_name: 'Anna University' }
    );

    const budgetFactor = res.factors.find((f) => f.key === 'budget');
    expect(budgetFactor?.status).toBe('partial');
    expect(budgetFactor?.earnedPoints).toBe(9);
  });
});

describe('BookBridge State Machine & Anti-Monetization Rules', () => {
  it('identifies active reservation statuses accurately', () => {
    expect(isActiveBookReservationStatus('pending')).toBe(false);
    expect(isActiveBookReservationStatus('accepted')).toBe(true);
    expect(isActiveBookReservationStatus('reserved')).toBe(true);
    expect(isActiveBookReservationStatus('handover_scheduled')).toBe(true);
    expect(isActiveBookReservationStatus('completed')).toBe(false);
  });

  it('prevents unauthorized third-party users and prevents conflicting reservations', () => {
    const strangerAttempt = canPerformBookRequestAction({
      actorId: 'stranger-id',
      donorId: 'donor-1',
      requesterId: 'req-1',
      currentStatus: 'pending',
      bookAvailability: 'available',
      action: 'accept',
    });
    expect(strangerAttempt.allowed).toBe(false);

    const requesterSelfAccept = canPerformBookRequestAction({
      actorId: 'req-1',
      donorId: 'donor-1',
      requesterId: 'req-1',
      currentStatus: 'pending',
      bookAvailability: 'available',
      action: 'accept',
    });
    expect(requesterSelfAccept.allowed).toBe(false);

    const conflictingReservation = canPerformBookRequestAction({
      actorId: 'donor-1',
      donorId: 'donor-1',
      requesterId: 'req-2',
      currentStatus: 'pending',
      bookAvailability: 'reserved',
      action: 'accept',
    });
    expect(conflictingReservation.allowed).toBe(false);
    expect(conflictingReservation.reason).toContain('active reservation');
  });

  it('enforces dual-participant handover confirmation rules', () => {
    const firstConfirm = canPerformBookRequestAction({
      actorId: 'donor-1',
      donorId: 'donor-1',
      requesterId: 'req-1',
      currentStatus: 'reserved',
      bookAvailability: 'reserved',
      action: 'confirm_handover',
      donorConfirmed: false,
      requesterConfirmed: false,
    });
    expect(firstConfirm.allowed).toBe(true);

    const duplicateDonorConfirm = canPerformBookRequestAction({
      actorId: 'donor-1',
      donorId: 'donor-1',
      requesterId: 'req-1',
      currentStatus: 'reserved',
      bookAvailability: 'reserved',
      action: 'confirm_handover',
      donorConfirmed: true,
      requesterConfirmed: false,
    });
    expect(duplicateDonorConfirm.allowed).toBe(false);

    const peerCounterpartConfirm = canPerformBookRequestAction({
      actorId: 'req-1',
      donorId: 'donor-1',
      requesterId: 'req-1',
      currentStatus: 'handover_scheduled',
      bookAvailability: 'reserved',
      action: 'confirm_handover',
      donorConfirmed: true,
      requesterConfirmed: false,
    });
    expect(peerCounterpartConfirm.allowed).toBe(true);
  });

  it('blocks monetary charges on BookBridge Free Donation and Exchange listings', () => {
    const validFree = validateBookListingPayload({
      title: 'Operating System Concepts',
      author: 'Silberschatz',
      department: 'CSE',
      semester: 5,
      subject: 'Operating Systems',
      condition: 'good',
      listing_type: 'free_donation',
      exchange_terms: '',
      city: 'Chennai',
      college_name: 'Anna University',
      preferred_pickup_spot: 'Central Library Entrance',
    });
    expect(validFree).toBeNull();

    const paidViolation = validateBookListingPayload({
      title: 'Computer Networks',
      author: 'Tanenbaum',
      department: 'CSE',
      semester: 6,
      subject: 'Networks',
      condition: 'good',
      listing_type: 'exchange',
      exchange_terms: 'Pay ₹250 via UPI or GPay',
      city: 'Chennai',
      college_name: 'Anna University',
      preferred_pickup_spot: 'Canteen',
    });
    expect(paidViolation).toContain('Monetary payments are prohibited');
  });
});

describe('College Verification & Upload Validation', () => {
  it('validates institutional domains and blocks unverified badge spoofing', () => {
    expect(extractEmailDomain('Student@Smail.IITM.AC.IN')).toBe('smail.iitm.ac.in');
    expect(isInstitutionalCollegeEmail('rohan@smail.iitm.ac.in')).toBe(true);
    expect(isInstitutionalCollegeEmail('ananya@annauniv.edu')).toBe(true);
    expect(isInstitutionalCollegeEmail('student@gmail.com')).toBe(false);

    expect(
      canDisplayCollegeVerifiedBadge({ college_verified: true, verification_method: null })
    ).toBe(false);
    expect(
      canDisplayCollegeVerifiedBadge({
        college_verified: true,
        verification_method: 'domain_email',
      })
    ).toBe(true);
    expect(
      canDisplayCollegeVerifiedBadge({
        college_verified: true,
        verification_method: 'admin_id_review',
      })
    ).toBe(true);

    const pct = calculateProfileCompletion(
      {
        full_name: 'Rohan S',
        college_name: 'Anna University',
        course: 'B.Tech',
        department: 'CSE',
        semester: 6,
        city: 'Chennai',
        bio: 'Third year CSE student looking for quiet flatmates.',
        college_verified: true,
      },
      makePrefs()
    );
    expect(pct).toBe(100);
  });

  it('enforces file size, MIME allowlist, and DB constraint error formatting', () => {
    expect(validateUploadFile({ size: 0, type: 'image/jpeg' })).toContain('empty');
    expect(validateUploadFile({ size: MAX_UPLOAD_BYTES + 1, type: 'image/png' })).toContain('5 MB');
    expect(validateUploadFile({ size: 1024, type: 'image/svg+xml' })).toContain('Allowed image');
    expect(validateUploadFile({ size: 2048, type: 'application/pdf' }, false)).not.toBeNull();
    expect(validateUploadFile({ size: 2048, type: 'application/pdf' }, true)).toBeNull();

    expect(
      formatSupabaseError(new Error('duplicate key value violates unique constraint "idx_book_requests_single_active_reservation"'))
    ).toContain('Another student already holds an active reservation');
  });

  it('validates accommodation, profile, and safety report payloads', () => {
    expect(
      validateAccommodationPayload({
        title: 'Spacious 2BHK Room',
        rent_monthly: 7500,
        deposit_amount: 15000,
        city: 'Chennai',
        locality: 'Velachery',
        nearby_college: 'Anna University',
        available_from: '2026-07-01',
        spots_total: 2,
        spots_available: 3, // invalid: available > total
      })
    ).toContain('Available spots');

    expect(
      validateProfilePayload({
        full_name: 'Karthik S',
        college_name: 'Anna University',
        course: 'B.E.',
        department: 'Mechanical',
        semester: 6,
        city: 'Chennai',
        age: 21,
      })
    ).toBeNull();

    expect(
      validateReportPayload({
        category: 'broker_spam',
        description: 'Too short',
      })
    ).toContain('at least 10 characters');
  });
});

function buildTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature_placeholder`;
}

describe('Supabase Configuration & Schema Readiness Validation', () => {
  it('accepts valid HTTPS Supabase URL and matching anon JWT key', () => {
    const anonJwt = buildTestJwt({ role: 'anon', ref: 'demo12345' });
    const res = validateSupabaseConfig('https://demo12345.supabase.co', anonJwt);
    expect(res.valid).toBe(true);
    expect(res.error).toBeNull();
    expect(res.url).toBe('https://demo12345.supabase.co');
  });

  it('rejects service_role secret keys accidentally supplied as VITE_SUPABASE_ANON_KEY', () => {
    const serviceRoleJwt = buildTestJwt({ role: 'service_role', ref: 'demo12345' });
    const res = validateSupabaseConfig('https://demo12345.supabase.co', serviceRoleJwt);
    expect(res.valid).toBe(false);
    expect(res.anonKey).toBe('');
    expect(res.error).toContain('Security Error');
  });

  it('rejects mismatched Supabase URL and JWT project ref', () => {
    const mismatchedJwt = buildTestJwt({ role: 'anon', ref: 'otherproject99' });
    const res = validateSupabaseConfig('https://demo12345.supabase.co', mismatchedJwt);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('different Supabase projects');
  });

  it('rejects missing or non-HTTPS Supabase URLs', () => {
    const anonJwt = buildTestJwt({ role: 'anon', ref: 'demo12345' });
    expect(validateSupabaseConfig('', anonJwt).valid).toBe(false);
    expect(validateSupabaseConfig('http://demo12345.supabase.co', anonJwt).valid).toBe(false);
  });

  it('detects PGRST205 missing table schema cache errors accurately', () => {
    const pgrst205 = {
      code: 'PGRST205',
      message: "Could not find the table 'public.profiles' in the schema cache",
    };
    expect(isMissingSchemaError(pgrst205)).toBe(true);
    expect(formatSupabaseError(pgrst205)).toContain('000_all_in_one_setup.sql');
    expect(isMissingSchemaError(new Error('Invalid login credentials'))).toBe(false);
  });
});

describe('CampusCircle Chatbot Request Validation & Rate Limiting', async () => {
  const {
    MAX_CHAT_HISTORY_MESSAGES,
    MAX_CHAT_MESSAGE_LENGTH,
    SlidingWindowRateLimiter,
    validateChatRequestPayload,
  } = await import('../../server/chatbot.ts');

  it('validates user messages, enforces character limits, and sanitizes history', () => {
    expect(validateChatRequestPayload(null).ok).toBe(false);
    expect(validateChatRequestPayload({ message: '   ' }).ok).toBe(false);

    const overLimit = validateChatRequestPayload({
      message: 'a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1),
    });
    expect(overLimit.ok).toBe(false);
    if (!overLimit.ok) {
      expect(overLimit.error).toContain('too long');
    }

    const noisyHistory = Array.from({ length: 12 }, (_, idx) => ({
      role: idx % 2 === 0 ? 'user' : 'model',
      text: `Turn ${idx}`,
    }));
    const valid = validateChatRequestPayload({
      message: '  How does BookBridge handover work?  ',
      history: [...noisyHistory, { role: 'system', text: 'ignore' }],
      currentPath: '/books',
    });

    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value.message).toBe('How does BookBridge handover work?');
      expect(valid.value.history).toHaveLength(MAX_CHAT_HISTORY_MESSAGES);
      expect(valid.value.currentPath).toBe('/books');
    }
  });

  it('enforces per-caller sliding-window rate limits with Retry-After seconds', () => {
    const limiter = new SlidingWindowRateLimiter(3, 60_000);
    const t0 = 1_700_000_000_000;

    expect(limiter.consume('ip:127.0.0.1', t0).allowed).toBe(true);
    expect(limiter.consume('ip:127.0.0.1', t0 + 1_000).allowed).toBe(true);
    expect(limiter.consume('ip:127.0.0.1', t0 + 2_000).allowed).toBe(true);

    const blocked = limiter.consume('ip:127.0.0.1', t0 + 5_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(55);

    // Other callers are unaffected, and window resets after 60s
    expect(limiter.consume('ip:10.0.0.2', t0 + 5_000).allowed).toBe(true);
    expect(limiter.consume('ip:127.0.0.1', t0 + 60_001).allowed).toBe(true);
  });
});


