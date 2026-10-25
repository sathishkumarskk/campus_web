import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface CampusCirclePublicConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  anonKeyMisconfiguredAsServiceRole?: boolean;
  allowedCollegeDomains?: string;
  appUrl?: string;
}

declare global {
  interface Window {
    __CAMPUSCIRCLE_PUBLIC_CONFIG__?: CampusCirclePublicConfig;
  }
}

export interface SupabaseConfigValidation {
  valid: boolean;
  url: string;
  anonKey: string;
  error: string | null;
}

function getRuntimePublicConfig(): CampusCirclePublicConfig {
  if (typeof window !== 'undefined' && window.__CAMPUSCIRCLE_PUBLIC_CONFIG__) {
    return window.__CAMPUSCIRCLE_PUBLIC_CONFIG__;
  }
  return {};
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function validateSupabaseConfig(
  explicitUrl?: string,
  explicitAnonKey?: string,
  misconfiguredAsServiceRole = false
): SupabaseConfigValidation {
  const runtimeCfg = getRuntimePublicConfig();

  const url = (
    explicitUrl ??
    runtimeCfg.supabaseUrl ??
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
    ''
  ).trim();

  const anonKey = (
    explicitAnonKey ??
    runtimeCfg.supabaseAnonKey ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    ''
  ).trim();

  if (misconfiguredAsServiceRole || runtimeCfg.anonKeyMisconfiguredAsServiceRole) {
    return {
      valid: false,
      url,
      anonKey: '',
      error:
        'Security Error: VITE_SUPABASE_ANON_KEY is set to a privileged service_role key. Replace it in Secrets with your public anon key.',
    };
  }

  if (!url || url.includes('your-project-ref')) {
    return {
      valid: false,
      url: '',
      anonKey: '',
      error:
        'Missing VITE_SUPABASE_URL. Set it in Secrets to your Supabase Project URL (https://<project-ref>.supabase.co).',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      valid: false,
      url,
      anonKey: '',
      error: 'Invalid VITE_SUPABASE_URL format. Must be a valid https:// URL.',
    };
  }

  if (parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      url,
      anonKey: '',
      error: 'Invalid VITE_SUPABASE_URL protocol. Supabase URLs must begin with https://.',
    };
  }

  if (!anonKey || anonKey === 'your-supabase-anon-public-key') {
    return {
      valid: false,
      url,
      anonKey: '',
      error:
        'Missing VITE_SUPABASE_ANON_KEY. Set it in Secrets to your Supabase public anon/publishable key.',
    };
  }

  // Validate JWT claims if standard Supabase JWT anon key is supplied
  if (anonKey.startsWith('eyJ')) {
    const claims = decodeJwtPayload(anonKey);
    if (!claims) {
      return {
        valid: false,
        url,
        anonKey: '',
        error: 'Invalid VITE_SUPABASE_ANON_KEY: Malformed JWT token.',
      };
    }
    if (claims.role === 'service_role') {
      return {
        valid: false,
        url,
        anonKey: '',
        error:
          'Security Error: Never pass the Supabase service_role secret key into VITE_SUPABASE_ANON_KEY. Use the public anon key instead.',
      };
    }
    if (
      parsedUrl.hostname.endsWith('.supabase.co') &&
      typeof claims.ref === 'string' &&
      claims.ref.length > 0
    ) {
      const hostRef = parsedUrl.hostname.split('.')[0];
      if (hostRef && hostRef !== claims.ref) {
        return {
          valid: false,
          url,
          anonKey: '',
          error:
            'Configuration Mismatch: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY belong to different Supabase projects.',
        };
      }
    }
  } else if (!anonKey.startsWith('sb_publishable_') && anonKey.length < 24) {
    return {
      valid: false,
      url,
      anonKey: '',
      error:
        'Invalid VITE_SUPABASE_ANON_KEY format. Expected a Supabase anon JWT or sb_publishable_ key.',
    };
  }

  return {
    valid: true,
    url: parsedUrl.origin,
    anonKey,
    error: null,
  };
}

export const supabaseConfigValidation: SupabaseConfigValidation = validateSupabaseConfig();
export const isSupabaseConfigured: boolean = supabaseConfigValidation.valid;
export const supabaseConfigError: string | null = supabaseConfigValidation.error;
export const resolvedSupabaseUrl: string = supabaseConfigValidation.url;
export const resolvedSupabaseAnonKey: string = supabaseConfigValidation.anonKey;

// When unconfigured, block outgoing network calls cleanly so the browser never logs DNS errors.
const effectiveUrl = isSupabaseConfigured
  ? resolvedSupabaseUrl
  : 'https://unconfigured.invalid';
const effectiveKey = isSupabaseConfigured
  ? resolvedSupabaseAnonKey
  : 'unconfigured-anon-key-placeholder';

export const supabase: SupabaseClient = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  ...(isSupabaseConfigured
    ? {}
    : {
        global: {
          fetch: async () => {
            throw new Error(
              supabaseConfigError ||
                'Supabase is not configured. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Secrets.'
            );
          },
        },
      }),
});

export function isMissingSchemaError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    const msg = 'message' in error ? String((error as { message?: unknown }).message || '') : '';
    if (code === 'PGRST205' || code === '42P01') return true;
    if (
      msg.includes('Could not find the table') ||
      msg.includes('in the schema cache') ||
      (msg.includes('relation "public.') && msg.includes('does not exist'))
    ) {
      return true;
    }
  }
  if (typeof error === 'string') {
    return (
      error.includes('PGRST205') ||
      error.includes('Could not find the table') ||
      error.includes('in the schema cache')
    );
  }
  return false;
}

export type StorageBucketName = 'avatars' | 'accommodations' | 'books' | 'verification-docs';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_VERIFICATION_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export function validateUploadFile(
  file: { size: number; type: string },
  allowPdf = false
): string | null {
  if (!file || file.size <= 0) {
    return 'Selected file is empty.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'File size must not exceed 5 MB.';
  }
  const allowed: readonly string[] = allowPdf
    ? ALLOWED_VERIFICATION_MIME_TYPES
    : ALLOWED_IMAGE_MIME_TYPES;
  if (!allowed.includes(file.type)) {
    return allowPdf
      ? 'Allowed file formats: JPEG, PNG, WebP, or PDF.'
      : 'Allowed image formats: JPEG, PNG, or WebP.';
  }
  return null;
}

export async function uploadAssetToBucket(params: {
  bucket: StorageBucketName;
  userId: string;
  file: File;
  replaceStoragePath?: string | null;
}): Promise<{ storagePath: string; publicUrl: string }> {
  if (!isSupabaseConfigured) {
    throw new Error(
      supabaseConfigError ||
        'Supabase Storage is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Secrets.'
    );
  }

  const allowPdf = params.bucket === 'verification-docs';
  const validationError = validateUploadFile(params.file, allowPdf);
  if (validationError) {
    throw new Error(validationError);
  }

  const ext = params.file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ext.replace(/[^a-z0-9]/g, '') || 'jpg';
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`;
  const storagePath = `${params.userId}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from(params.bucket)
    .upload(storagePath, params.file, {
      cacheControl: '3600',
      contentType: params.file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(formatSupabaseError(uploadError, 'Failed to upload file to storage.'));
  }

  if (params.replaceStoragePath && params.replaceStoragePath.startsWith(`${params.userId}/`)) {
    await supabase.storage.from(params.bucket).remove([params.replaceStoragePath]);
  }

  if (params.bucket === 'verification-docs') {
    return { storagePath, publicUrl: '' };
  }

  const { data } = supabase.storage.from(params.bucket).getPublicUrl(storagePath);
  return {
    storagePath,
    publicUrl: data.publicUrl,
  };
}

export async function deleteStoragePaths(
  bucket: StorageBucketName,
  paths: string[]
): Promise<void> {
  if (!isSupabaseConfigured || paths.length === 0) return;
  const validPaths = paths.filter((p) => Boolean(p && p.includes('/')));
  if (validPaths.length === 0) return;
  await supabase.storage.from(bucket).remove(validPaths);
}

export function formatSupabaseError(
  error: unknown,
  fallback = 'Operation failed. Please try again.'
): string {
  if (!error) return fallback;
  if (isMissingSchemaError(error)) {
    return 'Database tables have not been migrated yet. Open your Supabase Dashboard → SQL Editor and run supabase/migrations/000_all_in_one_setup.sql.';
  }
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const msg = error.message || '';
    if (msg.includes('idx_book_requests_single_active_reservation')) {
      return 'Another student already holds an active reservation for this textbook.';
    }
    if (msg.includes('idx_flat_requests_active_unique')) {
      return 'You already have an active inquiry for this accommodation listing.';
    }
    if (msg.includes('idx_flatmate_connections_active_pair')) {
      return 'An active connection request already exists between you and this peer.';
    }
    if (msg.includes('idx_unique_pending_verification')) {
      return 'You already have a pending college ID verification request under review.';
    }
    if (msg.toLowerCase().includes('invalid login credentials')) {
      return 'Incorrect email or password. New to CampusCircle? Switch to the Register tab to create your student account.';
    }
    if (msg.toLowerCase().includes('email not confirmed')) {
      return 'Please verify your email address first. Check your inbox for the confirmation link or click Resend Verification Email.';
    }
    if (msg.toLowerCase().includes('user already registered')) {
      return 'An account with this email already exists. Sign in or use Forgot Password.';
    }
    if (msg.toLowerCase().includes('database error saving new user')) {
      return 'Database setup incomplete: Run supabase/migrations/000_all_in_one_setup.sql in your Supabase SQL Editor before registering.';
    }
    if (msg.includes('Failed to fetch') || msg.includes('ENOTFOUND')) {
      return 'Unable to reach Supabase. Verify your network connection and VITE_SUPABASE_URL.';
    }
    return msg;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return formatSupabaseError(
      new Error(String((error as { message: unknown }).message)),
      fallback
    );
  }
  return fallback;
}
