import dns from 'dns';
import net from 'net';
import type { Request, Response } from 'express';
import {
  FunctionDeclaration,
  GenerateContentResponse,
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type Part,
} from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { CAMPUSCIRCLE_SYSTEM_INSTRUCTION } from './campusKnowledge.ts';

dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

export const MAX_CHAT_MESSAGE_LENGTH = 600;
export const MAX_CHAT_HISTORY_MESSAGES = 8;
const MAX_HISTORY_TURN_LENGTH = 800;

export interface ChatHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

export interface ValidatedChatRequest {
  message: string;
  history: ChatHistoryTurn[];
  currentPath: string;
}

export function validateChatRequestPayload(
  body: unknown
): { ok: true; value: ValidatedChatRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request payload.' };
  }

  const raw = body as {
    message?: unknown;
    history?: unknown;
    currentPath?: unknown;
  };

  if (typeof raw.message !== 'string') {
    return { ok: false, error: 'Please enter a message.' };
  }

  const trimmedMessage = raw.message.trim();
  if (!trimmedMessage) {
    return { ok: false, error: 'Message cannot be empty.' };
  }

  if (trimmedMessage.length > MAX_CHAT_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message is too long (${trimmedMessage.length}/${MAX_CHAT_MESSAGE_LENGTH} characters). Please shorten your question.`,
    };
  }

  const validHistory: ChatHistoryTurn[] = [];
  if (Array.isArray(raw.history)) {
    for (const item of raw.history) {
      if (!item || typeof item !== 'object') continue;
      const role = (item as { role?: unknown }).role;
      const text = (item as { text?: unknown }).text;
      if ((role === 'user' || role === 'model') && typeof text === 'string' && text.trim()) {
        validHistory.push({
          role,
          text: text.trim().slice(0, MAX_HISTORY_TURN_LENGTH),
        });
      }
    }
  }
  const sanitizedHistory = validHistory.slice(-MAX_CHAT_HISTORY_MESSAGES);

  const rawPath = typeof raw.currentPath === 'string' ? raw.currentPath.trim() : '/';
  const safePath = rawPath.startsWith('/') ? rawPath.slice(0, 120) : '/';

  return {
    ok: true,
    value: {
      message: trimmedMessage,
      history: sanitizedHistory,
      currentPath: safePath,
    },
  };
}

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly buckets = new Map<string, number[]>();

  constructor(maxRequests = 15, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const cutoff = now - this.windowMs;
    const existing = (this.buckets.get(key) || []).filter((ts) => ts > cutoff);

    if (existing.length >= this.maxRequests) {
      const oldest = existing[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.buckets.set(key, existing);
      return { allowed: false, retryAfterSeconds };
    }

    existing.push(now);
    this.buckets.set(key, existing);

    // Opportunistic cleanup so the map stays bounded
    if (this.buckets.size > 500) {
      for (const [k, timestamps] of this.buckets.entries()) {
        const active = timestamps.filter((ts) => ts > cutoff);
        if (active.length === 0) {
          this.buckets.delete(k);
        } else {
          this.buckets.set(k, active);
        }
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }
}

const chatRateLimiter = new SlidingWindowRateLimiter(15, 60_000);

function getGeminiApiKey(): string {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return '';
  return key;
}

let cachedAiClient: { key: string; client: GoogleGenAI } | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  if (cachedAiClient && cachedAiClient.key === apiKey) {
    return cachedAiClient.client;
  }
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: 12_000,
      retryOptions: {
        attempts: 1,
      },
    },
  });
  cachedAiClient = { key: apiKey, client };
  return client;
}

const CHAT_MODEL_CANDIDATES = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'] as const;
type SupportedChatModel = (typeof CHAT_MODEL_CANDIDATES)[number];

function isTransientModelError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toUpperCase();
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('HIGH DEMAND') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('TIMEOUT') ||
    msg.includes('ABORT') ||
    msg.includes('FETCH FAILED')
  );
}

async function generateWithModel(
  ai: GoogleGenAI,
  model: SupportedChatModel,
  contents: Content[],
  declarations: FunctionDeclaration[]
): Promise<GenerateContentResponse> {
  return ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: CAMPUSCIRCLE_SYSTEM_INSTRUCTION,
      temperature: 0.3,
      ...(model === 'gemini-3.8-flash'
        ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
        : {}),
      tools: [{ functionDeclarations: declarations }],
    },
  });
}

async function generateInitialTurnWithFallback(
  ai: GoogleGenAI,
  contents: Content[],
  declarations: FunctionDeclaration[]
): Promise<{ response: GenerateContentResponse; activeModel: SupportedChatModel }> {
  let lastError: unknown = null;
  for (const candidateModel of CHAT_MODEL_CANDIDATES) {
    try {
      const response = await generateWithModel(ai, candidateModel, contents, declarations);
      return { response, activeModel: candidateModel };
    } catch (err) {
      lastError = err;
      if (!isTransientModelError(err)) {
        throw err;
      }
    }
  }
  throw lastError;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

const searchPublishedFlatsDeclaration: FunctionDeclaration = {
  name: 'searchPublishedFlats',
  description:
    'Search live published student accommodation listings on CampusCircle FlatMate. Returns public listing details only (never private contact info).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      city: {
        type: Type.STRING,
        description: 'Optional city filter, e.g., Chennai, Bengaluru, Hyderabad, Coimbatore.',
      },
      maxRent: {
        type: Type.NUMBER,
        description: 'Optional maximum monthly rent in INR, e.g., 9000.',
      },
      roomType: {
        type: Type.STRING,
        description:
          'Optional room type: private_room, shared_room, entire_flat, or studio_1rk.',
      },
      query: {
        type: Type.STRING,
        description: 'Optional locality, college name, or keyword search.',
      },
    },
  },
};

const searchAvailableBooksDeclaration: FunctionDeclaration = {
  name: 'searchAvailableBooks',
  description:
    'Search live available textbooks on CampusCircle BookBridge for free donation or exchange. Returns public book metadata only.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Optional book title, author, subject, or course code keyword.',
      },
      department: {
        type: Type.STRING,
        description: 'Optional academic department, e.g., CSE, ECE, EEE, Mechanical, IT.',
      },
      semester: {
        type: Type.INTEGER,
        description: 'Optional semester number between 1 and 12.',
      },
      listingType: {
        type: Type.STRING,
        description: 'Optional listing type: free_donation or exchange.',
      },
      city: {
        type: Type.STRING,
        description: 'Optional city filter.',
      },
    },
  },
};

const getMyCampusSummaryDeclaration: FunctionDeclaration = {
  name: 'getMyCampusSummary',
  description:
    "Get the currently signed-in student's own profile verification status, profile completion readiness, and counts of their own housing, flatmate, and book requests.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      includeRequestCounts: {
        type: Type.BOOLEAN,
        description: 'Set to true to include counts of active requests for the signed-in user.',
      },
    },
  },
};

interface SupabaseChatContext {
  supabaseUrl: string;
  supabaseAnonKey: string;
  verifiedUserToken: string | null;
  verifiedUserId: string | null;
}

async function resolveCallerAuth(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ token: string | null; userId: string | null }> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ') || !supabaseUrl || !supabaseAnonKey) {
    return { token: null, userId: null };
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return { token: null, userId: null };

  try {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonClient.auth.getUser(token);
    if (error || !data.user) {
      return { token: null, userId: null };
    }
    return { token, userId: data.user.id };
  } catch {
    return { token: null, userId: null };
  }
}

async function executeReadOnlyTool(
  name: string,
  args: Record<string, unknown>,
  ctx: SupabaseChatContext
): Promise<Record<string, unknown>> {
  if (!ctx.supabaseUrl || !ctx.supabaseAnonKey) {
    return {
      available: false,
      note: 'Live database connection is not configured right now.',
    };
  }

  // Public read-only client strictly bound to Supabase anon key & PostgreSQL RLS
  const publicClient = createClient(ctx.supabaseUrl, ctx.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (name === 'searchPublishedFlats') {
    let builder = publicClient
      .from('accommodation_listings')
      .select(
        'id, title, property_type, room_type, gender_preference, rent_monthly, deposit_amount, city, locality, nearby_college, distance_km, available_from, spots_available, amenities',
        { count: 'exact' }
      )
      .eq('status', 'published');

    if (typeof args.city === 'string' && args.city.trim()) {
      builder = builder.ilike('city', `%${args.city.trim().slice(0, 50)}%`);
    }
    if (typeof args.maxRent === 'number' && Number.isFinite(args.maxRent) && args.maxRent > 0) {
      builder = builder.lte('rent_monthly', Math.round(args.maxRent));
    }
    if (
      typeof args.roomType === 'string' &&
      ['private_room', 'shared_room', 'entire_flat', 'studio_1rk'].includes(args.roomType)
    ) {
      builder = builder.eq('room_type', args.roomType);
    }
    if (typeof args.query === 'string' && args.query.trim()) {
      const safeQ = args.query.trim().replace(/[%_,()]/g, ' ').slice(0, 60).trim();
      if (safeQ) {
        builder = builder.or(
          `title.ilike.%${safeQ}%,locality.ilike.%${safeQ}%,nearby_college.ilike.%${safeQ}%`
        );
      }
    }

    const { data, count, error } = await builder
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      return {
        available: false,
        note: 'Could not query accommodation listings right now.',
      };
    }

    return {
      totalMatchingPublishedFlats: count ?? 0,
      sampleListings: (data || []).map((row) => ({
        ...row,
        path: `/flats/${row.id}`,
      })),
    };
  }

  if (name === 'searchAvailableBooks') {
    let builder = publicClient
      .from('book_listings')
      .select(
        'id, title, author, edition, course_code, department, semester, subject, condition, listing_type, exchange_terms, city, college_name, preferred_pickup_spot',
        { count: 'exact' }
      )
      .eq('availability_status', 'available');

    if (typeof args.department === 'string' && args.department.trim()) {
      builder = builder.ilike('department', `%${args.department.trim().slice(0, 40)}%`);
    }
    if (
      typeof args.semester === 'number' &&
      Number.isInteger(args.semester) &&
      args.semester >= 1 &&
      args.semester <= 12
    ) {
      builder = builder.eq('semester', args.semester);
    }
    if (
      typeof args.listingType === 'string' &&
      ['free_donation', 'exchange'].includes(args.listingType)
    ) {
      builder = builder.eq('listing_type', args.listingType);
    }
    if (typeof args.city === 'string' && args.city.trim()) {
      builder = builder.ilike('city', `%${args.city.trim().slice(0, 50)}%`);
    }
    if (typeof args.query === 'string' && args.query.trim()) {
      const safeQ = args.query.trim().replace(/[%_,()]/g, ' ').slice(0, 60).trim();
      if (safeQ) {
        builder = builder.or(
          `title.ilike.%${safeQ}%,author.ilike.%${safeQ}%,subject.ilike.%${safeQ}%,course_code.ilike.%${safeQ}%`
        );
      }
    }

    const { data, count, error } = await builder
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      return {
        available: false,
        note: 'Could not query textbook listings right now.',
      };
    }

    return {
      totalMatchingAvailableBooks: count ?? 0,
      sampleBooks: (data || []).map((book) => ({
        ...book,
        path: `/books/${book.id}`,
      })),
    };
  }

  if (name === 'getMyCampusSummary') {
    if (!ctx.verifiedUserToken || !ctx.verifiedUserId) {
      return {
        signedIn: false,
        note: 'The user is not currently signed in. Direct them to /auth to sign in or register.',
      };
    }

    // Authenticated RLS-scoped client acting strictly as the verified student (never service_role)
    const userScopedClient = createClient(ctx.supabaseUrl, ctx.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${ctx.verifiedUserToken}`,
        },
      },
    });

    const [profileRes, flatReqsRes, bookReqsRes, connRes] = await Promise.all([
      userScopedClient
        .from('profiles')
        .select(
          'full_name, college_name, course, department, semester, city, college_verified, verification_method'
        )
        .eq('id', ctx.verifiedUserId)
        .maybeSingle(),
      userScopedClient
        .from('flat_requests')
        .select('id, status')
        .or(`requester_id.eq.${ctx.verifiedUserId},owner_id.eq.${ctx.verifiedUserId}`),
      userScopedClient
        .from('book_requests')
        .select('id, status')
        .or(`requester_id.eq.${ctx.verifiedUserId},donor_id.eq.${ctx.verifiedUserId}`),
      userScopedClient
        .from('flatmate_connections')
        .select('id, status')
        .or(`sender_id.eq.${ctx.verifiedUserId},receiver_id.eq.${ctx.verifiedUserId}`),
    ]);

    return {
      signedIn: true,
      profile: profileRes.data || null,
      myFlatRequestsCount: (flatReqsRes.data || []).length,
      myBookRequestsCount: (bookReqsRes.data || []).length,
      myFlatmateConnectionsCount: (connRes.data || []).length,
    };
  }

  return { error: 'Unsupported tool.' };
}

function mapGeminiErrorToHttp(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || '');
  const upper = raw.toUpperCase();

  if (upper.includes('429') || upper.includes('RESOURCE_EXHAUSTED') || upper.includes('QUOTA')) {
    return {
      status: 429,
      message:
        'The AI assistant is temporarily busy due to Gemini API rate limits. Please wait a few seconds and try again.',
    };
  }

  if (
    upper.includes('API_KEY_INVALID') ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('403')
  ) {
    return {
      status: 503,
      message:
        'The Gemini API key could not be authorized. Please check GEMINI_API_KEY in the AI Studio Settings > Secrets panel.',
    };
  }

  return {
    status: 502,
    message:
      'Could not reach the CampusCircle AI assistant right now. Please check your connection and try again.',
  };
}

export async function handleChatRequest(
  req: Request,
  res: Response,
  supabaseConfig: { supabaseUrl: string; supabaseAnonKey: string }
): Promise<void> {
  const validation = validateChatRequestPayload(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error:
        'CampusCircle AI Assistant is awaiting server configuration. Ensure GEMINI_API_KEY is set in Settings > Secrets.',
    });
    return;
  }

  const { token: verifiedUserToken, userId: verifiedUserId } = await resolveCallerAuth(
    req,
    supabaseConfig.supabaseUrl,
    supabaseConfig.supabaseAnonKey
  );

  const clientIp =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : '') ||
    req.socket.remoteAddress ||
    'unknown';
  const rateLimitKey = verifiedUserId ? `user:${verifiedUserId}` : `ip:${clientIp}`;
  const rateCheck = chatRateLimiter.consume(rateLimitKey);

  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
    res.status(429).json({
      error: `You're sending messages a little too fast. Please wait ${rateCheck.retryAfterSeconds}s before asking your next question.`,
    });
    return;
  }

  const { message, history, currentPath } = validation.value;

  const contents: Content[] = history.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));

  const contextualPrefix = `[Viewer context: currently on page "${currentPath}", authentication: ${
    verifiedUserId ? 'signed-in student' : 'guest visitor'
  }]\n`;

  contents.push({
    role: 'user',
    parts: [{ text: `${contextualPrefix}${message}` }],
  });

  const declarations: FunctionDeclaration[] = [
    searchPublishedFlatsDeclaration,
    searchAvailableBooksDeclaration,
    ...(verifiedUserId ? [getMyCampusSummaryDeclaration] : []),
  ];

  const dbCtx: SupabaseChatContext = {
    supabaseUrl: supabaseConfig.supabaseUrl,
    supabaseAnonKey: supabaseConfig.supabaseAnonKey,
    verifiedUserToken,
    verifiedUserId,
  };

  try {
    const initial = await generateInitialTurnWithFallback(ai, contents, declarations);
    let response = initial.response;
    const activeModel = initial.activeModel;

    // Execute up to 2 rounds of read-only tool calls using the same model family
    let toolRound = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && toolRound < 2) {
      toolRound += 1;
      const modelTurnContent = response.candidates?.[0]?.content;
      if (modelTurnContent) {
        contents.push(modelTurnContent);
      }

      const responseParts: Part[] = [];
      for (const call of response.functionCalls) {
        const fnName = call.name || '';
        const fnArgs = (call.args as Record<string, unknown> | undefined) || {};
        const result = await executeReadOnlyTool(fnName, fnArgs, dbCtx);
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: fnName,
            response: result,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: responseParts,
      });

      response = await generateWithModel(ai, activeModel, contents, declarations);
    }

    const replyText = (response.text || '').trim();
    if (!replyText) {
      res.json({
        reply:
          "I couldn't generate a reliable answer for that right now. Try rephrasing your question about FlatMate, BookBridge, or College Verification.",
      });
      return;
    }

    res.json({ reply: replyText });
  } catch (err) {
    console.error('CampusCircle /api/chat error:', err instanceof Error ? err.message : err);
    const mapped = mapGeminiErrorToHttp(err);
    res.status(mapped.status).json({ error: mapped.message });
  }
}
