# CampusCircle — Student Housing, Flatmate Matching & Textbook Exchange Platform

CampusCircle unifies verified student accommodation discovery, lifestyle-based flatmate matching (**FlatMate**), and zero-cost peer-to-peer textbook sharing (**BookBridge**) into a single production-grade web platform for university students in India, backed by Supabase PostgreSQL, Auth, Storage, Realtime, and strict Row Level Security.

## User Review & Critical Decisions

> [!IMPORTANT]
> Stage 1 inspection and architectural alignment are complete. Please review the decisions and staged execution roadmap below, then click **Proceed** to begin building from Stage 2 onward.

- **Confirmed Decision 1 — External Supabase Backend**: All persistence, authentication, storage, real-time messaging/notifications, and authorization policies run against your Supabase project (`PostgreSQL + Auth + Storage + Realtime + RLS`), paired with a lightweight Express server gateway strictly for privileged server-only operations (such as full account deletion cleanup) and iframe-compatible OAuth callback bridging.
- **Confirmed Decision 2 — Faithful Stitch Preservation + Unified Design System Extension**: The four supplied Google Stitch screens (**Home**, **Flats**, **Dashboard**, and **Flatmates**) will be preserved faithfully in layout, color tokens, typography, and micro-interactions. Remaining screens (**BookBridge Marketplace**, **Auth & Onboarding**, **Profile & Lifestyle Quiz**, **Listing & Book Detail Views**, **Activity & Real-Time Chat**, and **Admin Moderation Console**) will be built directly from the supplied **CampusCircle Safe System** specification.
- **Confirmed Decision 3 — Dual-Path College Verification**: Students achieve verified status either automatically by confirming an institutional college email address (`.ac.in`, `.edu`, `.edu.in`) via Supabase Auth email verification, or by submitting a college ID document for administrator approval in the moderation queue. Sample or self-declared fields never grant verified badges.

> [!NOTE]
> **Required Secrets Before Live Database Operations**: Once implementation begins, you will configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` in the AI Studio Secrets panel, then run the versioned SQL migration script in your Supabase SQL Editor or CLI. Until credentials are provided, the application will display a clear, non-deceptive configuration readiness prompt rather than fabricating mock persistence.

---

## 1. Overview & Core Concept

- **What It Does**: Enables college students across Indian university hubs (Chennai, Bengaluru, Hyderabad, Coimbatore, and custom campuses) to discover zero-brokerage rooms, match with compatible flatmates using transparent lifestyle scoring, donate or swap semester textbooks with conflict-free reservation states, message authorized peers in real time, and report unsafe listings or behavior to campus moderators.
- **Target Audience / Persona**: Undergraduate and postgraduate students seeking affordable bachelor-friendly stays near campus, seniors vacating rooms or passing down textbooks, and campus administrators moderating community safety.
- **Key Value**: Eliminates broker fees and textbook expenses while protecting student privacy through verified institutional accountability, participant-gated contact details, and database-enforced access control.
- **Incremental Execution Roadmap (Stages 2–8)**:
  - **Stage 2 — Foundation, Navigation & Database Schema**: Configure CampusCircle design tokens, responsive app shell (5-tab mobile bottom bar + 12-column desktop navigation), environment validation, Supabase client + Express server gateway, and complete version-controlled PostgreSQL migrations with RLS and Storage policies.
  - **Stage 3 — Authentication, Profiles & Access Control**: Registration, login, logout, session persistence, email verification, password recovery, iframe-safe Google OAuth popup flow, student profile & lifestyle preference editor, dual-path college verification, privacy settings, route protection, and full account deletion cleanup.
  - **Stage 4 — BookBridge Module**: Textbook CRUD (Free Donation & Exchange), multi-photo Supabase Storage uploads, course/branch/semester/condition search & filtering, bookmarking, book request creation with campus safe pickup proposals, atomic reservation conflict prevention, lifecycle transitions (`pending` → `accepted`/`reserved` → `handover_scheduled` → `completed` / `cancelled` / `declined`), and dual-party handover confirmation.
  - **Stage 5 — FlatMate Module**: Accommodation listing CRUD with photo management, search/filter/sort/pagination (city, college proximity text/hub, rent budget, room type, amenities, move-in date), saved flats, expressions of interest with owner review, deterministic flatmate compatibility engine with transparent point-by-point alignment/difference explanations, preference recalculation, and connection requests gating private contact details.
  - **Stage 6 — Shared Activity Center, Notifications & Real-Time Messaging**: Unified personalized Dashboard, tabbed Activity Center (`My Listings`, `Saved Items`, `Flat Requests`, `Flatmate Connections`, `Book Requests`), database-triggered real-time notifications, and 1:1 real-time conversations restricted to authorized request/connection participants.
  - **Stage 7 — Trust, Safety & Administrator Moderation**: User and listing reporting workflows, peer blocking (filtering blocked users from chat and requests), campus safety guidance banners for property visits and handovers, Admin Moderation Console (college ID verification review, report triage, listing removal, user suspension/restoration), and immutable moderation audit logs.
  - **Stage 8 — Verification, Security Auditing & Deployment Readiness**: Automated unit/integration tests for compatibility math, reservation conflict rules, handover state transitions, auth guards, responsive desktop/mobile audit, and complete Supabase + production deployment documentation.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Discovery & Onboarding**: Visitors explore the Stitch **Home** hub, browse public **Flats** and **BookBridge** feeds, and register/sign in via institutional email + password or Google OAuth. New students complete their academic profile and 60-second flatmate lifestyle quiz, optionally verifying their `.ac.in`/`.edu` address or uploading their student ID for admin review.
  2. **FlatMate Journey**: Students filter stays by hub/college, rent ceiling, room type, move-in date, and amenities, inspect photo galleries and house rules, save favorites, or send an expression of interest. In **Flatmates**, students view ranked peer cards showing exact deterministic match scores (e.g., `88% Match`) with itemized habit matches and differences, then send connection requests to unlock private 1:1 chat.
  3. **BookBridge Journey**: Seniors publish textbooks as **Free Donation** (strictly ₹0) or **Exchange** (specifying desired swap terms) with a 5-bar Condition Meter. Juniors filter by department, semester, course code, and condition, then submit a request proposing a campus handover spot (e.g., Main Canteen, Library Porch). Once the donor accepts, conflicting requests are locked out, both parties coordinate in chat, and handover completion is confirmed.
  4. **Dashboard, Activity & Safety**: The **Dashboard** surfaces real profile completion progress, verification state, active flatmate match updates, upcoming book handovers, and personalized recommendations. Any listing or user profile provides immediate Report and Block actions routed to the Admin Moderation Console.

- **Visual Identity & Theme (CampusCircle Safe System)**:
  - *Aesthetic Direction*: High-trust modern collegiate utility combining crisp structural cards, daylight-legible contrast, and calm institutional dependability without bulletin-board clutter.
  - *Color Palette & Tokens*:
    - Canvas & Surfaces: `--surface` (`#faf8ff`), `--surface-container-lowest` (`#ffffff`), `--surface-container-low` (`#f2f3ff`), `--surface-container` (`#eaedff`), `--surface-container-high` (`#e2e7ff`), `--surface-container-highest` (`#dae2fd`).
    - Brand Accents: `--primary` (`#00685f` deep campus teal for CTAs, verified states, housing actions), `--secondary` (`#4b41e1` academic indigo for BookBridge, exchange milestones, department tags), `--tertiary` (`#825100` / `#ffddb8` warm amber for urgent match alerts and pickup reminders), `--error` (`#ba1a1a` for destructive actions and validation errors).
    - Ink & Outlines: `--on-surface` (`#131b2e`), `--on-surface-variant` (`#3d4947`), `--outline` (`#6d7a77`), `--outline-variant` (`#bcc9c6`).
  - *Typography & Hierarchy*: **Inter** across the Stitch type scale (`display` 40px, `headline-lg` 32px, `headline-md` 24px, `headline-sm` 20px, `title-md` 16px, `body-md` 15px, `body-sm` 13px, `label-md` 14px, `label-sm` 12px) paired with `tabular-nums` for rents, deposits, compatibility percentages, and counts, plus **Material Symbols Outlined** icons matching the Stitch markup.
  - *Responsive Layout Architecture*: Preserves the exact mobile thumb-zone layout (`< 768px` fixed top bar + 5-tab bottom bar) while expanding seamlessly on tablet (`768px–1024px` 8-column split) and desktop (`> 1024px` `1280px` max-width 12-column workspace with persistent top/side navigation, multi-column card grids, and split detail drawers) so desktop viewports never collapse into a narrow mobile column.

- **Interactive Feedback & Motion**:
  - Skeleton loading placeholders matching exact card geometry during Supabase queries.
  - Action buttons disable during in-flight mutations and show confirmation toasts **only after** PostgreSQL/Storage commits succeed.
  - Upload progress bars with client-side + bucket-level MIME (`JPEG/PNG/WebP`) and size (`≤ 5 MB`) validation.
  - Graceful session-expiry detection prompting re-authentication without losing draft form state.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Client-Side RLS Queries + Minimal Privileged Express Gateway**
  - *Chosen Approach*: Standard CRUD, filtering, Storage uploads, and Realtime subscriptions run directly from the typed Supabase client under strict PostgreSQL Row Level Security and `SECURITY DEFINER` database functions, while the Express backend handles health checks, iframe-safe Google OAuth popup callback exchange, and privileged account deletion cleanup using `SUPABASE_SERVICE_ROLE_KEY`.
  - *Why*: Keeps secrets 100% off the browser, eliminates redundant proxy latency for everyday reads/writes, and guarantees security at the database layer even if a user calls the Supabase REST API directly.
  - *Alternatives Considered*: Routing every query through custom Express endpoints without RLS (rejected because your specification mandates tested PostgreSQL RLS policies on all exposed tables).

- **Decision 2 — Transparent, Deterministic Flatmate Compatibility Engine**
  - *Chosen Approach*: A pure, deterministic 100-point weighted algorithm comparing two students' structured `student_preferences` records across 7 explicit dimensions: **Dietary Alignment (20 pts)**, **Smoking & Alcohol Compatibility (20 pts)**, **Sleep & Study Schedule (15 pts)**, **Cleanliness Standard (15 pts)**, **Budget Range Overlap (15 pts)**, **Guest & Noise Policy (10 pts)**, and **Same College / City Hub Alignment (5 pts)**.
  - *Why*: Produces reproducible scores (`0–100%`), explains every exact match and mismatch on the card (e.g., *"Vegetarian — Exact Match"*, *"Sleep Schedule — Early Riser vs. Night Owl"*), and recalculates instantaneously when preferences change—with zero black-box fabrication.
  - *Alternatives Considered*: Arbitrary keyword overlap or opaque embedding similarity (rejected because students need clear, trustworthy explanations of *why* a peer matches or differs).

- **Decision 3 — Database-Enforced Atomic Book Reservations & State Machine**
  - *Chosen Approach*: Enforce book request state transitions inside a transactional PostgreSQL RPC (`transition_book_request_status`) backed by a partial unique index ensuring **at most one active reservation** (`status IN ('accepted', 'reserved', 'handover_scheduled')`) exists per `book_id` at any moment, automatically syncing `book_listings.availability_status`.
  - *Why*: Eliminates race conditions when two students request or a donor accepts concurrent requests for the same textbook, and prevents unauthorized participants from jumping states or marking someone else's handover complete.
  - *Alternatives Considered*: Client-side status updates (rejected due to TOCTOU race conditions and unauthorized status tampering risks).

- **Decision 4 — Immutable Privilege Columns & Contact Privacy Separation**
  - *Chosen Approach*: Store `role` (`student` | `admin`), `is_suspended`, and `college_verified` on `profiles` behind a PostgreSQL `BEFORE UPDATE` trigger that rejects modifications unless executed by an authenticated `admin` or trusted `service_role`. Store sensitive contact fields (`phone`, `whatsapp`, `private_notes`) in a separate `profile_private_contacts` table whose RLS policy grants read access **only** to the owner or peers with an `accepted` flatmate connection, `accepted` flat request, or active book handover.
  - *Why*: PostgreSQL RLS applies at the row level rather than column level; isolating private contact fields in a dedicated table guarantees public flatmate/listing browsers can never scrape phone numbers via custom API queries.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         CAMPUSCIRCLE CLIENT (React 19 + TS)                           │
│                                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Responsive App Shell (Top Header • Desktop Nav Rail • Mobile 5-Tab Bottom Bar)  │  │
│  └──────┬───────────────┬───────────────┬───────────────┬───────────────┬──────────┘  │
│         │               │               │               │               │             │
│         ▼               ▼               ▼               ▼               ▼             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐  │
│  │ Home & Auth │ │  Dashboard  │ │  FlatMate   │ │  FlatMate   │ │   BookBridge    │  │
│  │  • Landing  │ │  & Activity │ │   Stays     │ │   Peers     │ │   Marketplace   │  │
│  │  • Sign Up  │ │  • Overview │ │  • Feed/Map │ │  • Matcher  │ │  • Browse/Swap  │  │
│  │  • Verify   │ │  • Requests │ │  • Create   │ │  • Quiz     │ │  • Donate Form  │  │
│  │  • Recovery │ │  • 1:1 Chat │ │  • Details  │ │  • Connect  │ │  • Handovers    │  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └────────┬────────┘  │
│         │               │               │               │                 │           │
│         └───────────────┴───────────────┼───────────────┴─────────────────┘           │
│                                         ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Shared Services: Auth/Session Store • Compatibility Scorer • Safety & Admin UI  │  │
│  └──────────────────────────┬───────────────────────────────────┬──────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┼─────────────────────┘
                              │                                   │
         Typed Supabase SDK   │ (Anon Key + User JWT)             │ Bearer JWT
         + Realtime WebSocket │                                   ▼
                              │                    ┌─────────────────────────────────┐
                              │                    │  Express Server Gateway (:3000) │
                              │                    │  • /auth/callback (Popup OAuth) │
                              │                    │  • /api/account/delete          │
                              │                    │  • /api/health                  │
                              │                    └──────────────┬──────────────────┘
                              ▼                                   │ Service Role Key
┌─────────────────────────────────────────────────────────────────┴─────────────────────┐
│                        EXTERNAL SUPABASE PRODUCTION BACKEND                           │
│                                                                                       │
│  ┌──────────────────┐  ┌───────────────────────────────────┐  ┌────────────────────┐  │
│  │  Supabase Auth   │  │   PostgreSQL + Strict RLS + RPCs  │  │  Supabase Storage  │  │
│  │  • Email + OTP   │  │  • Profiles, Private Contacts     │  │  • avatars (pub)   │  │
│  │  • Reset Pass    │  │  • Preferences & Verifications    │  │  • flats (pub)     │  │
│  │  • Google OAuth  │  │  • Flats, Images, Flat Requests   │  │  • books (pub)     │  │
│  └──────────────────┘  │  • Connections, Books, Handovers  │  │  • id-docs (priv)  │  │
│                        │  • Conversations, Messages        │  └────────────────────┘  │
│  ┌──────────────────┐  │  • Notifications, Reports, Blocks │                          │
│  │ Supabase Realtime│  │  • Moderation Audit Logs          │                          │
│  │  • Chat & Alerts │  └───────────────────────────────────┘                          │
│  └──────────────────┘                                                                 │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Normalized Data Model & Access Control Strategy**:
  - **Identity & Preferences**:
    - `profiles`: Public academic identity (`id` linked to `auth.users`, `full_name`, `college_name`, `college_domain`, `course`, `department`, `semester`, `city`, `bio`, `avatar_url`, `college_verified`, `verification_method`, `role`, `is_suspended`, `notification_prefs`, `privacy_prefs`, timestamps). Protected by an immutable-privilege `BEFORE UPDATE` trigger so ordinary users can edit their profile fields without ever altering `role`, `college_verified`, or `is_suspended`.
    - `profile_private_contacts`: Sensitive contact info (`user_id`, `phone_number`, `whatsapp_number`, `preferred_contact_time`) readable only by the owner or peers sharing an accepted connection/request.
    - `student_preferences`: Structured flatmate & housing criteria (`user_id`, `looking_for`, `budget_min`, `budget_max`, `preferred_cities`, `preferred_localities`, `move_in_date`, `diet`, `sleep_schedule`, `cleanliness_level`, `smoking_pref`, `alcohol_pref`, `study_habit`, `guest_policy`, `book_interests`, `is_discoverable`).
    - `college_verification_requests`: Student ID document submissions (`id`, `user_id`, `college_email`, `document_storage_path`, `status`, `reviewer_id`, `review_notes`, timestamps) readable only by the submitting student and `admin` users.
  - **FlatMate Entities**:
    - `accommodation_listings`: Room/flat inventory (`id`, `owner_id`, `title`, `description`, `property_type`, `room_type`, `gender_preference`, `rent_monthly`, `deposit_amount`, `city`, `locality`, `nearby_college`, `distance_label`, `address_line`, `available_from`, `spots_total`, `spots_available`, `amenities[]`, `house_rules[]`, `status` [`draft` | `published` | `occupied` | `removed`], timestamps).
    - `accommodation_images`: Ordered property photos (`id`, `listing_id`, `storage_path`, `public_url`, `display_order`).
    - `flat_requests`: Expressions of interest (`id`, `listing_id`, `requester_id`, `owner_id`, `move_in_date`, `message`, `status` [`pending` | `accepted` | `declined` | `cancelled`], timestamps) with unique active request constraint per student/listing.
    - `flatmate_connections`: Peer match requests (`id`, `sender_id`, `receiver_id`, `intro_message`, `compatibility_snapshot`, `status` [`pending` | `accepted` | `declined` | `cancelled`], timestamps).
  - **BookBridge Entities**:
    - `book_listings`: Textbooks (`id`, `donor_id`, `title`, `author`, `edition`, `isbn`, `course_code`, `department`, `semester`, `subject`, `condition` [`new` | `good` | `fair` | `marked` | `worn`], `condition_score` `1–5`, `listing_type` [`free_donation` | `exchange`], `exchange_terms`, `city`, `college_name`, `pickup_spot`, `photos[]`, `availability_status` [`draft` | `available` | `reserved` | `completed` | `removed`], timestamps). Check constraint enforces `exchange_terms IS NULL` or optional on `free_donation` and zero monetary price fields anywhere.
    - `book_requests`: Request & handover state machine (`id`, `book_id`, `requester_id`, `donor_id`, `message`, `proposed_spot`, `proposed_time`, `agreed_exchange_note`, `status` [`pending` | `accepted` | `declined` | `reserved` | `handover_scheduled` | `completed` | `cancelled`], `donor_confirmed_handover`, `requester_confirmed_handover`, timestamps). Partial unique index on `(book_id)` where `status IN ('accepted', 'reserved', 'handover_scheduled')` prevents double-booking.
  - **Shared Activity, Messaging, Notifications & Moderation**:
    - `saved_items`: Unified bookmarks (`user_id`, `item_type` [`flat` | `book`], `flat_id`, `book_id`).
    - `conversations` & `messages`: 1:1 threads linked to an authorized context (`flat_request_id`, `flatmate_connection_id`, or `book_request_id`); RLS verifies participant membership and checks `user_blocks` before inserting messages.
    - `notifications`: Database-event alerts (`user_id`, `type`, `title`, `body`, `link_path`, `is_read`, `created_at`) populated automatically by PostgreSQL `AFTER INSERT / UPDATE` triggers on requests, connections, handovers, and moderation actions.
    - `user_reports`, `user_blocks`, & `moderation_actions`: Structured safety reports (`category`, `target_type`, `target_id`, `description`, `status`), bidirectional block enforcement, and append-only administrator audit records.

- **Interactive Component & State Mapping**:
  - *Search, Filter, Sort & Pagination*: Server-backed Supabase `.select(..., { count: 'exact' })` queries with debounced search inputs, URL-synced filter state, deterministic sort selectors (newest, rent low-to-high, rent high-to-low, move-in date), and page controls.
  - *Creation & Editing Flows*: Multi-step validated forms for Accommodation Listings, BookBridge Donations/Swaps, and Lifestyle Preferences, supporting draft vs. published state, image upload/reordering/deletion in Supabase Storage, and immediate rollback if an upload or DB insert fails.
  - *State Transitions & Real-Time Sync*: Request accept/decline, handover scheduling, dual-party completion confirmation, chat messages, and notification read states execute through transactional RPCs/mutations, updating UI state only after confirmed DB response while pushing live updates to connected peers via Supabase Realtime channels.
