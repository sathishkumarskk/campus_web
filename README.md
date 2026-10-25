# CampusCircle — Student Accommodation & Textbook Exchange Platform

CampusCircle is a full-stack web application built for university students in India, combining two campus services under one shared student identity:

- **FlatMate:** Zero-brokerage student room & flat listings, multi-photo uploads, expressions of interest, and a deterministic 100-point flatmate compatibility engine across 7 lifestyle and budget dimensions.
- **BookBridge:** Free semester textbook donations (`₹0` strictly enforced) and peer-to-peer academic book swaps with atomic reservation exclusivity and dual-confirmed safe campus handovers.

---

## 1. Architecture Overview

- **Frontend:** React 19, TypeScript, Tailwind CSS v4 (preserving the CampusCircle Google Stitch design system), React Router v7.
- **Database, Auth, Storage & Realtime:** Supabase (`@supabase/supabase-js`) with Row-Level Security (RLS), atomic PostgreSQL RPC functions, and `postgres_changes` real-time subscriptions for messages and notifications.
- **Backend Server (`server.ts`):** Express server on port `3000` providing:
  - `GET /api/health` — Readiness probe (never exposes secrets).
  - `GET /auth/callback` — Popup-safe OAuth callback bridge (`postMessage` to opener window for iframe and standalone browser compatibility).
  - `DELETE /api/account` — Server-side privileged account deletion (`SUPABASE_SERVICE_ROLE_KEY`) that releases active book reservations, purges user files across all Storage buckets, and deletes the `auth.users` account.

---

## 2. Required Supabase Setup

### Step 1: Create a Supabase Project & Configure Secrets
Copy `.env.example` to `.env` locally (or configure Secrets in your hosting environment):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client & Server | Your Supabase project URL (`https://<project-ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Client & Server | Your Supabase `anon` public key (safe for browser with RLS enabled) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-Only** | Required strictly by `server.ts` for `DELETE /api/account`. **Never prefix with `VITE_`.** |
| `VITE_ALLOWED_COLLEGE_DOMAINS` | Optional Client | Comma-separated institutional domains in addition to `.ac.in`, `.edu.in`, and `.edu` |

### Step 2: Execute Database Migrations in Order
Open the **Supabase SQL Editor** and execute the three SQL files in `/supabase/migrations/` in exact numerical order:

1. `supabase/migrations/001_schema.sql` — Creates all 16 normalized tables, check constraints (including zero-cash rules on `book_listings`), and partial unique indexes (`idx_book_requests_single_active_reservation`, `idx_flat_requests_active_unique`, `idx_flatmate_connections_active_pair`).
2. `supabase/migrations/002_rls_and_storage.sql` — Enables RLS across every table, creates helper functions (`is_admin()`, `is_active_user()`, `is_blocked_between()`, `can_view_private_contact()`), and provisions the 4 Storage buckets (`avatars`, `accommodations`, `books`, and private `verification-docs`) with 5 MB limits and MIME policies.
3. `supabase/migrations/003_functions_and_triggers.sql` — Installs privilege-escalation guards (`guard_profile_privileged_columns`), automatic profile/institutional-domain sync on `auth.users` email confirmation (`handle_auth_user_sync`), atomic `transition_book_request` RPC, notification/conversation triggers, `perform_moderation_action` admin RPC, and `supabase_realtime` publication tables.

### Step 3: Configure Authentication & OAuth Redirect URLs
In **Supabase Dashboard → Authentication → URL Configuration**:
- Add the following Redirect URLs so email verification, password recovery, and popup Google OAuth work across environments:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth`
  - `https://ais-dev-o5xwcxzba2pgqwozv3gelg-290961686449.asia-southeast1.run.app/auth/callback`
  - `https://ais-pre-o5xwcxzba2pgqwozv3gelg-290961686449.asia-southeast1.run.app/auth/callback`
  - Your production domain `/auth/callback` and `/auth`
- If enabling Google Sign-In, enable the **Google** provider under **Authentication → Providers** and paste your Google OAuth Client ID and Secret in Supabase.

### Step 4: Provisioning a CampusCircle Administrator
Ordinary users cannot elevate their own `role` or `college_verified` flag (`trg_guard_profile_privileges` blocks client-side privilege changes). To promote a trusted moderator account to `admin`, run in the **Supabase SQL Editor**:

```sql
update public.profiles
set role = 'admin'
where email = 'moderator@yourcollege.ac.in';
```

Once promoted, the **Moderation** console (`/admin`) unlocks for reviewing student ID cards, triaging reports, removing policy-violating listings, suspending abusive accounts, and auditing `moderation_actions`.

---

## 3. Development, Testing & Production Build

```bash
# Install dependencies
npm install

# Run full-stack development server on http://localhost:3000
npm run dev

# Run TypeScript static verification
npm run lint

# Run automated unit & domain state-machine test suite
npm test

# Build optimized production bundle into dist/
npm run build
```

For production deployment with Node 22+, build the frontend (`npm run build`) and start the Express server (`NODE_ENV=production npm start`).
