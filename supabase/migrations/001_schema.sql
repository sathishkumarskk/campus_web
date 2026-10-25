-- ==============================================================================
-- CampusCircle — Migration 001: Normalized PostgreSQL Schema & Indexes
-- ==============================================================================

create extension if not exists "pgcrypto";

-- 1. Student & Admin Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  age integer check (age is null or (age >= 16 and age <= 60)),
  gender text check (gender is null or gender in ('male', 'female', 'non_binary', 'prefer_not_to_say')),
  college_name text not null default '',
  college_domain text,
  course text not null default '',
  department text not null default '',
  semester integer check (semester is null or (semester >= 1 and semester <= 12)),
  city text not null default 'Chennai',
  bio text not null default '',
  avatar_url text,
  avatar_storage_path text,
  college_verified boolean not null default false,
  verification_method text check (verification_method is null or verification_method in ('domain_email', 'admin_id_review')),
  role text not null default 'student' check (role in ('student', 'admin')),
  is_suspended boolean not null default false,
  suspension_reason text,
  notification_prefs jsonb not null default '{"flat_requests": true, "flatmate_matches": true, "book_requests": true, "messages": true}'::jsonb,
  privacy_prefs jsonb not null default '{"show_profile_in_flatmates": true, "show_semester": true, "allow_connection_requests": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_city on public.profiles(city);
create index if not exists idx_profiles_college on public.profiles(college_name);
create index if not exists idx_profiles_role on public.profiles(role);

-- 2. Private Contact Details (Isolated from public profile row reads)
create table if not exists public.profile_private_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone_number text not null default '',
  whatsapp_number text not null default '',
  preferred_contact_hours text not null default '6 PM - 9 PM',
  updated_at timestamptz not null default now()
);

-- 3. Student Accommodation & Lifestyle Preferences (FlatMate Matching)
create table if not exists public.student_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hunt_status text not null default 'seeking_flat_and_flatmate'
    check (hunt_status in ('seeking_flat_and_flatmate', 'have_flat_need_flatmate', 'not_looking')),
  headline text not null default '',
  budget_min integer not null default 5000 check (budget_min >= 0),
  budget_max integer not null default 9000 check (budget_max >= budget_min),
  preferred_city text not null default 'Chennai',
  preferred_localities text[] not null default '{}',
  move_in_date date,
  diet text not null default 'vegetarian'
    check (diet in ('vegetarian', 'eggetarian', 'non_vegetarian', 'vegan')),
  sleep_schedule text not null default 'flexible'
    check (sleep_schedule in ('early_riser', 'night_owl', 'flexible')),
  cleanliness text not null default 'tidy'
    check (cleanliness in ('very_tidy', 'tidy', 'relaxed')),
  smoking text not null default 'no'
    check (smoking in ('no', 'outside_only', 'yes')),
  alcohol text not null default 'no'
    check (alcohol in ('no', 'socially', 'yes')),
  study_habit text not null default 'quiet_hours'
    check (study_habit in ('quiet_hours', 'library_studier', 'collaborative', 'flexible')),
  guest_policy text not null default 'occasional'
    check (guest_policy in ('no_overnight', 'occasional', 'weekends_ok', 'open')),
  hobbies text[] not null default '{}',
  book_interests text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_preferences_city_status
  on public.student_preferences(preferred_city, hunt_status);

-- 4. College ID Verification Queue
create table if not exists public.college_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  college_name text not null check (char_length(trim(college_name)) >= 2),
  college_email text,
  student_roll_number text not null check (char_length(trim(student_roll_number)) >= 2),
  id_card_storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists idx_unique_pending_verification
  on public.college_verification_requests(user_id)
  where status = 'pending';

-- 5. Accommodation Listings (FlatMate)
create table if not exists public.accommodation_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) >= 5),
  description text not null default '',
  property_type text not null default 'apartment'
    check (property_type in ('apartment', 'independent_house', 'pg_hostel', 'studio')),
  room_type text not null default 'private_room'
    check (room_type in ('private_room', 'shared_room', 'entire_flat', 'studio_1rk')),
  gender_preference text not null default 'any'
    check (gender_preference in ('any', 'male_only', 'female_only')),
  rent_monthly integer not null check (rent_monthly > 0 and rent_monthly <= 200000),
  deposit_amount integer not null default 0 check (deposit_amount >= 0),
  city text not null,
  locality text not null,
  address_line text not null default '',
  nearby_college text not null,
  distance_km numeric(4,1) check (distance_km is null or (distance_km >= 0 and distance_km <= 50)),
  transport_note text not null default '',
  available_from date not null,
  spots_total integer not null default 1 check (spots_total >= 1 and spots_total <= 10),
  spots_available integer not null default 1 check (spots_available >= 0 and spots_available <= spots_total),
  amenities text[] not null default '{}',
  house_rules text[] not null default '{}',
  status text not null default 'published'
    check (status in ('draft', 'published', 'occupied', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accommodation_city_status
  on public.accommodation_listings(city, status, rent_monthly);
create index if not exists idx_accommodation_owner
  on public.accommodation_listings(owner_id);

-- 6. Accommodation Photographs
create table if not exists public.accommodation_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.accommodation_listings(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_accommodation_images_listing
  on public.accommodation_images(listing_id, display_order);

-- 7. Expressions of Interest on Accommodation Listings
create table if not exists public.flat_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.accommodation_listings(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  preferred_move_in date not null,
  message text not null check (char_length(trim(message)) >= 5),
  owner_response text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flat_requests_not_self check (requester_id <> owner_id)
);

create unique index if not exists idx_flat_requests_active_unique
  on public.flat_requests(listing_id, requester_id)
  where status in ('pending', 'accepted');
create index if not exists idx_flat_requests_owner on public.flat_requests(owner_id, status);
create index if not exists idx_flat_requests_requester on public.flat_requests(requester_id, status);

-- 8. Flatmate Peer Connection Requests
create table if not exists public.flatmate_connections (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  intro_message text not null default '',
  compatibility_score integer not null check (compatibility_score >= 0 and compatibility_score <= 100),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flatmate_connections_not_self check (sender_id <> receiver_id)
);

create unique index if not exists idx_flatmate_connections_active_pair
  on public.flatmate_connections(least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status in ('pending', 'accepted');

-- 9. BookBridge Textbook Listings (Zero Monetary Charge Enforced)
create table if not exists public.book_listings (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) >= 2),
  author text not null check (char_length(trim(author)) >= 2),
  edition text not null default '',
  isbn text not null default '',
  course_code text not null default '',
  department text not null,
  semester integer not null check (semester >= 1 and semester <= 12),
  subject text not null,
  condition text not null check (condition in ('new', 'good', 'fair', 'marked', 'worn')),
  condition_score integer not null check (condition_score >= 1 and condition_score <= 5),
  listing_type text not null check (listing_type in ('free_donation', 'exchange')),
  exchange_terms text,
  description text not null default '',
  city text not null,
  college_name text not null,
  preferred_pickup_spot text not null,
  photo_urls text[] not null default '{}',
  photo_paths text[] not null default '{}',
  availability_status text not null default 'available'
    check (availability_status in ('draft', 'available', 'reserved', 'completed', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_exchange_terms_valid check (
    (listing_type = 'free_donation' and (exchange_terms is null or char_length(trim(exchange_terms)) = 0))
    or
    (listing_type = 'exchange' and exchange_terms is not null and char_length(trim(exchange_terms)) >= 3)
  )
);

create index if not exists idx_book_listings_browse
  on public.book_listings(availability_status, department, semester, city);
create index if not exists idx_book_listings_donor on public.book_listings(donor_id);

-- 10. BookBridge Requests & Campus Handovers
create table if not exists public.book_requests (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_listings(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  proposed_spot text not null check (char_length(trim(proposed_spot)) >= 2),
  proposed_time text not null check (char_length(trim(proposed_time)) >= 2),
  agreed_exchange_note text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'reserved', 'handover_scheduled', 'completed', 'cancelled')),
  donor_confirmed boolean not null default false,
  requester_confirmed boolean not null default false,
  handover_scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_requests_not_self check (requester_id <> donor_id)
);

-- Prevents two students from ever holding conflicting active reservations on the same textbook
create unique index if not exists idx_book_requests_single_active_reservation
  on public.book_requests(book_id)
  where status in ('accepted', 'reserved', 'handover_scheduled');

create unique index if not exists idx_book_requests_requester_active
  on public.book_requests(book_id, requester_id)
  where status in ('pending', 'accepted', 'reserved', 'handover_scheduled');

-- 11. Unified Saved Items (Flats & Books)
create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('flat', 'book')),
  flat_id uuid references public.accommodation_listings(id) on delete cascade,
  book_id uuid references public.book_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_items_target_valid check (
    (item_type = 'flat' and flat_id is not null and book_id is null)
    or
    (item_type = 'book' and book_id is not null and flat_id is null)
  )
);

create unique index if not exists idx_saved_items_flat on public.saved_items(user_id, flat_id) where flat_id is not null;
create unique index if not exists idx_saved_items_book on public.saved_items(user_id, book_id) where book_id is not null;

-- 12. Authorized 1:1 Conversations & Messages
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one uuid not null references public.profiles(id) on delete cascade,
  participant_two uuid not null references public.profiles(id) on delete cascade,
  context_type text not null check (context_type in ('flatmate_connection', 'flat_request', 'book_request')),
  context_id uuid not null,
  context_title text not null default '',
  last_message_preview text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversations_distinct_participants check (participant_one <> participant_two)
);

create unique index if not exists idx_conversations_context_unique
  on public.conversations(context_type, context_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) >= 1 and char_length(body) <= 2000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_time
  on public.messages(conversation_id, created_at asc);

-- 13. Real-Time Database Event Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null
    check (category in ('flat_request', 'flatmate_match', 'book_request', 'handover', 'message', 'moderation', 'verification')),
  title text not null,
  body text not null,
  action_path text not null default '/dashboard',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, is_read, created_at desc);

-- 14. Peer Blocking
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint user_blocks_not_self check (blocker_id <> blocked_id),
  constraint user_blocks_unique unique (blocker_id, blocked_id)
);

-- 15. User & Listing Safety Reports
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'flat_listing', 'book_listing', 'message')),
  target_user_id uuid references public.profiles(id) on delete set null,
  target_flat_id uuid references public.accommodation_listings(id) on delete set null,
  target_book_id uuid references public.book_listings(id) on delete set null,
  category text not null
    check (category in ('broker_spam', 'paid_book_violation', 'fake_listing', 'harassment', 'unsafe_behavior', 'inaccurate_info', 'other')),
  description text not null check (char_length(trim(description)) >= 10),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  resolution_notes text,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_user_reports_status on public.user_reports(status, created_at desc);

-- 16. Immutable Administrative Moderation Audit Log
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null check (
    action_type in (
      'approve_verification',
      'reject_verification',
      'remove_flat_listing',
      'restore_flat_listing',
      'remove_book_listing',
      'restore_book_listing',
      'suspend_user',
      'restore_user',
      'resolve_report',
      'dismiss_report'
    )
  ),
  target_user_id uuid references public.profiles(id) on delete set null,
  target_entity_id uuid,
  reason text not null check (char_length(trim(reason)) >= 3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_actions_created on public.moderation_actions(created_at desc);
