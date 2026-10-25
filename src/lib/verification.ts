import type { Profile, StudentPreferences } from '../types/database';

const DEFAULT_INSTITUTIONAL_DOMAINS = [
  'annauniv.edu',
  'iitm.ac.in',
  'smail.iitm.ac.in',
  'christuniversity.in',
  'bits-pilani.ac.in',
  'iisc.ac.in',
  'srmist.edu.in',
  'psgtech.ac.in',
  'loyolacollege.edu',
];

function getConfiguredExtraDomains(): string[] {
  const fromWindow =
    typeof window !== 'undefined'
      ? window.__CAMPUSCIRCLE_PUBLIC_CONFIG__?.allowedCollegeDomains || ''
      : '';
  const fromVite = (import.meta.env.VITE_ALLOWED_COLLEGE_DOMAINS as string | undefined) || '';
  const combined = `${fromWindow},${fromVite}`;
  return combined
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
}

export function extractEmailDomain(email: string): string {
  if (!email || !email.includes('@')) return '';
  const parts = email.trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : '';
}

export function isInstitutionalCollegeEmail(
  email: string,
  extraAllowedDomains?: string[]
): boolean {
  const domain = extractEmailDomain(email);
  if (!domain || !domain.includes('.')) return false;

  if (
    domain.endsWith('.ac.in') ||
    domain.endsWith('.edu.in') ||
    domain.endsWith('.edu')
  ) {
    return true;
  }

  const customList = [
    ...DEFAULT_INSTITUTIONAL_DOMAINS,
    ...getConfiguredExtraDomains(),
    ...(extraAllowedDomains || []),
  ].map((d) => d.trim().toLowerCase().replace(/^\./, ''));

  return customList.some((allowed) => Boolean(allowed) && (domain === allowed || domain.endsWith(`.${allowed}`)));
}

export function canDisplayCollegeVerifiedBadge(
  profile: Pick<Profile, 'college_verified' | 'verification_method'> | null | undefined
): boolean {
  if (!profile) return false;
  return (
    profile.college_verified === true &&
    (profile.verification_method === 'domain_email' ||
      profile.verification_method === 'admin_id_review')
  );
}

export function calculateProfileCompletion(
  profile: Partial<Profile> | null | undefined,
  prefs?: Partial<StudentPreferences> | null
): number {
  if (!profile) return 0;

  const checks: boolean[] = [
    Boolean(profile.full_name && profile.full_name.trim().length >= 2),
    Boolean(profile.college_name && profile.college_name.trim().length >= 2),
    Boolean(profile.course && profile.course.trim().length >= 2),
    Boolean(profile.department && profile.department.trim().length >= 2),
    Boolean(profile.semester && profile.semester >= 1),
    Boolean(profile.city && profile.city.trim().length >= 2),
    Boolean(profile.bio && profile.bio.trim().length >= 10),
    Boolean(profile.college_verified),
    Boolean(prefs && prefs.budget_max && prefs.budget_max >= (prefs.budget_min ?? 0)),
    Boolean(prefs && prefs.diet && prefs.sleep_schedule && prefs.cleanliness),
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}
