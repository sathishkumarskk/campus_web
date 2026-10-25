import 'dotenv/config';
import dns from 'dns';
import net from 'net';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { handleChatRequest, isGeminiConfigured } from './server/chatbot.ts';

dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveAppPort(): number {
  const rawPort = (process.env.PORT || '').trim();
  const nginxPort = (process.env.NGINX_PORT || '').trim();
  const defaultAppPort = (process.env.DEFAULT_APP_PORT || '').trim();

  // In AI Studio preview/container environments, NGINX_PORT (e.g. 8080) is bound by the
  // reverse proxy which forwards traffic to DEFAULT_APP_PORT (3000).
  if (rawPort && nginxPort && rawPort === nginxPort) {
    return Number(defaultAppPort || 3000);
  }
  return Number(rawPort || defaultAppPort || 3000);
}

const PORT = resolveAppPort();

function getSupabaseUrl(): string {
  return (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
}

function getSupabaseAnonKey(): string {
  return (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
}

function getServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getJwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      role?: unknown;
    };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function isRealSupabaseConfig(url: string, anonKey: string): boolean {
  if (!url || !anonKey) return false;
  if (!url.startsWith('https://') || url.includes('your-project-ref')) return false;
  if (anonKey === 'your-supabase-anon-public-key') return false;
  // Never treat a service_role key as a valid browser anon key
  if (getJwtRole(anonKey) === 'service_role') return false;
  return true;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // 1. Public Browser Runtime Configuration (NEVER exposes SUPABASE_SERVICE_ROLE_KEY)
  app.get('/public-config.js', (_req: Request, res: Response) => {
    const supabaseUrl = getSupabaseUrl();
    const rawAnonKey = getSupabaseAnonKey();
    const anonKeyIsServiceRole = getJwtRole(rawAnonKey) === 'service_role';

    const publicPayload = {
      supabaseUrl,
      supabaseAnonKey: anonKeyIsServiceRole ? '' : rawAnonKey,
      anonKeyMisconfiguredAsServiceRole: anonKeyIsServiceRole,
      allowedCollegeDomains: (process.env.VITE_ALLOWED_COLLEGE_DOMAINS || '').trim(),
      appUrl: (process.env.APP_URL || '').trim(),
    };

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(
      `window.__CAMPUSCIRCLE_PUBLIC_CONFIG__ = ${JSON.stringify(publicPayload).replace(/</g, '\\u003c')};\n`
    );
  });

  // 2. Health & Database Schema Readiness Check (Never exposes secret values)
  app.get('/api/health', async (_req: Request, res: Response) => {
    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    const serviceKey = getServiceRoleKey();
    const configured = isRealSupabaseConfig(supabaseUrl, anonKey);

    let schemaReady = false;
    let schemaStatus: 'unconfigured' | 'ready' | 'missing_migrations' | 'error' = 'unconfigured';

    if (configured) {
      try {
        const probe = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        });
        if (probe.ok) {
          schemaReady = true;
          schemaStatus = 'ready';
        } else {
          const errBody = (await probe.json().catch(() => ({}))) as { code?: string };
          schemaStatus = errBody.code === 'PGRST205' ? 'missing_migrations' : 'error';
        }
      } catch {
        schemaStatus = 'error';
      }
    }

    res.json({
      ok: true,
      supabaseConfigured: configured,
      schemaReady,
      schemaStatus,
      chatbotConfigured: isGeminiConfigured(),
      accountDeletionConfigured:
        configured &&
        Boolean(serviceKey) &&
        serviceKey !== 'your-supabase-service-role-secret-key' &&
        getJwtRole(serviceKey) === 'service_role',
      appUrl: process.env.APP_URL || '',
    });
  });

  // 3. Popup-Safe OAuth Callback Bridge for Iframe & Standalone Environments
  app.get(['/auth/callback', '/auth/callback/'], (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CampusCircle — Completing Sign-In</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #faf8ff;
        color: #131b2e;
        font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .card {
        background: #ffffff;
        padding: 24px 28px;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(19, 27, 46, 0.08);
        text-align: center;
        max-width: 360px;
      }
      .badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 999px;
        background: #89f5e7;
        color: #00201d;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 12px;
      }
      p {
        margin: 8px 0 0;
        font-size: 14px;
        color: #3d4947;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">CampusCircle Auth</div>
      <div style="font-weight: 600; font-size: 16px;">Completing secure sign-in...</div>
      <p>This window will close automatically.</p>
    </div>
    <script>
      (function () {
        var payload = {
          type: 'CAMPUSCIRCLE_OAUTH_CALLBACK',
          search: window.location.search || '',
          hash: window.location.hash || ''
        };
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, window.location.origin);
          setTimeout(function () { window.close(); }, 250);
        } else {
          window.location.replace('/auth' + (window.location.search || '') + (window.location.hash || ''));
        }
      })();
    </script>
  </body>
</html>`);
  });

  // 4. Server-Side Privileged Account Deletion & Storage Cleanup
  app.delete('/api/account', async (req: Request, res: Response) => {
    try {
      const supabaseUrl = getSupabaseUrl();
      const anonKey = getSupabaseAnonKey();
      const serviceKey = getServiceRoleKey();

      if (
        !isRealSupabaseConfig(supabaseUrl, anonKey) ||
        !serviceKey ||
        serviceKey === 'your-supabase-service-role-secret-key'
      ) {
        res.status(503).json({
          error:
            'Account deletion requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server.',
        });
        return;
      }

      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
        return;
      }

      const accessToken = authHeader.slice('Bearer '.length).trim();
      const userClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const {
        data: { user },
        error: authErr,
      } = await userClient.auth.getUser(accessToken);

      if (authErr || !user) {
        res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
        return;
      }

      const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Release any books currently reserved by this student before deleting their account
      const { data: activeBookReqs } = await adminClient
        .from('book_requests')
        .select('book_id')
        .eq('requester_id', user.id)
        .in('status', ['accepted', 'reserved', 'handover_scheduled']);

      if (activeBookReqs && activeBookReqs.length > 0) {
        const bookIds = activeBookReqs.map((r: { book_id: string }) => r.book_id);
        await adminClient
          .from('book_listings')
          .update({ availability_status: 'available' })
          .in('id', bookIds);
      }

      // Clean up all user-owned storage objects across buckets
      const buckets = ['avatars', 'accommodations', 'books', 'verification-docs'];
      for (const bucket of buckets) {
        const { data: files } = await adminClient.storage.from(bucket).list(user.id, {
          limit: 200,
        });
        if (files && files.length > 0) {
          const paths = files.map((f: { name: string }) => `${user.id}/${f.name}`);
          await adminClient.storage.from(bucket).remove(paths);
        }
      }

      // Delete Auth user (cascades to profiles, listings, requests, messages, notifications)
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id);
      if (deleteErr) {
        console.error('Supabase admin deleteUser failed:', deleteErr);
        res.status(500).json({ error: 'Failed to complete account deletion.' });
        return;
      }

      res.json({ deleted: true });
    } catch (err) {
      console.error('Unexpected error during /api/account deletion:', err);
      res.status(500).json({ error: 'Internal server error during account deletion.' });
    }
  });

  // 5. Server-Side Gemini AI Chatbot Endpoint (Never exposes GEMINI_API_KEY or private data)
  app.post('/api/chat', async (req: Request, res: Response) => {
    const supabaseUrl = getSupabaseUrl();
    const rawAnonKey = getSupabaseAnonKey();
    const validSupabase = isRealSupabaseConfig(supabaseUrl, rawAnonKey);
    await handleChatRequest(req, res, {
      supabaseUrl: validSupabase ? supabaseUrl : '',
      supabaseAnonKey: validSupabase ? rawAnonKey : '',
    });
  });

  // 6. Mount Vite Dev Server or Production Static Assets
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CampusCircle server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
