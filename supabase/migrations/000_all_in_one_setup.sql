-- ==============================================================================
-- CampusCircle — Complete Idempotent Database Setup (001 + 002 + 003 Combined)
-- Paste this entire file into Supabase Dashboard -> SQL Editor -> New Query -> Run
-- (Or run 001_schema.sql, 002_rls_and_storage.sql, 003_functions_and_triggers.sql in order)
-- ==============================================================================


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


-- ==============================================================================
-- CampusCircle — Migration 002: Row Level Security (RLS) & Storage Policies
-- Idempotent: Safe to run multiple times in Supabase SQL Editor.
-- ==============================================================================

-- Helper security functions (SECURITY DEFINER with pinned search_path)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_suspended = false
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_suspended = false
  );
$$;

create or replace function public.is_blocked_between(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
$$;

create or replace function public.can_view_private_contact(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = target_user
    or public.is_admin()
    or (
      not public.is_blocked_between(auth.uid(), target_user)
      and (
        exists (
          select 1 from public.flatmate_connections
          where status = 'accepted'
            and ((sender_id = auth.uid() and receiver_id = target_user)
              or (sender_id = target_user and receiver_id = auth.uid()))
        )
        or exists (
          select 1 from public.flat_requests
          where status = 'accepted'
            and ((requester_id = auth.uid() and owner_id = target_user)
              or (requester_id = target_user and owner_id = auth.uid()))
        )
        or exists (
          select 1 from public.book_requests
          where status in ('accepted', 'reserved', 'handover_scheduled')
            and ((requester_id = auth.uid() and donor_id = target_user)
              or (requester_id = target_user and donor_id = auth.uid()))
        )
      )
    );
$$;

-- Enable RLS across every table
alter table public.profiles enable row level security;
alter table public.profile_private_contacts enable row level security;
alter table public.student_preferences enable row level security;
alter table public.college_verification_requests enable row level security;
alter table public.accommodation_listings enable row level security;
alter table public.accommodation_images enable row level security;
alter table public.flat_requests enable row level security;
alter table public.flatmate_connections enable row level security;
alter table public.book_listings enable row level security;
alter table public.book_requests enable row level security;
alter table public.saved_items enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;
alter table public.moderation_actions enable row level security;

-- 1. PROFILES POLICIES
drop policy if exists "Public non-suspended profiles readable by everyone" on public.profiles;
create policy "Public non-suspended profiles readable by everyone"
  on public.profiles for select
  using (is_suspended = false or id = auth.uid() or public.is_admin());

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'student' and college_verified = false and is_suspended = false);

drop policy if exists "Users can update own profile or admins can moderate" on public.profiles;
create policy "Users can update own profile or admins can moderate"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- 2. PRIVATE CONTACTS POLICIES
drop policy if exists "Authorized peers or owner can view private contacts" on public.profile_private_contacts;
create policy "Authorized peers or owner can view private contacts"
  on public.profile_private_contacts for select
  using (public.can_view_private_contact(user_id));

drop policy if exists "Owner can insert own private contacts" on public.profile_private_contacts;
create policy "Owner can insert own private contacts"
  on public.profile_private_contacts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owner can update own private contacts" on public.profile_private_contacts;
create policy "Owner can update own private contacts"
  on public.profile_private_contacts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. STUDENT PREFERENCES POLICIES
drop policy if exists "Authenticated active students can read discoverable preferences" on public.student_preferences;
create policy "Authenticated active students can read discoverable preferences"
  on public.student_preferences for select
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (
      auth.uid() is not null
      and not public.is_blocked_between(auth.uid(), user_id)
      and exists (
        select 1 from public.profiles p
        where p.id = student_preferences.user_id
          and p.is_suspended = false
          and coalesce((p.privacy_prefs->>'show_profile_in_flatmates')::boolean, true) = true
      )
    )
  );

drop policy if exists "Owner manages own preferences" on public.student_preferences;
create policy "Owner manages own preferences"
  on public.student_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. COLLEGE VERIFICATION REQUESTS POLICIES
drop policy if exists "Student or admin can read verification requests" on public.college_verification_requests;
create policy "Student or admin can read verification requests"
  on public.college_verification_requests for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Active student can submit verification request" on public.college_verification_requests;
create policy "Active student can submit verification request"
  on public.college_verification_requests for insert
  with check (auth.uid() = user_id and public.is_active_user() and status = 'pending');

drop policy if exists "Only admins can review verification requests" on public.college_verification_requests;
create policy "Only admins can review verification requests"
  on public.college_verification_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- 5. ACCOMMODATION LISTINGS & IMAGES POLICIES
drop policy if exists "Anyone can view published accommodation listings" on public.accommodation_listings;
create policy "Anyone can view published accommodation listings"
  on public.accommodation_listings for select
  using (status in ('published', 'occupied') or owner_id = auth.uid() or public.is_admin());

drop policy if exists "Active student can create own accommodation listing" on public.accommodation_listings;
create policy "Active student can create own accommodation listing"
  on public.accommodation_listings for insert
  with check (auth.uid() = owner_id and public.is_active_user() and status in ('draft', 'published'));

drop policy if exists "Owner or admin can update accommodation listing" on public.accommodation_listings;
create policy "Owner or admin can update accommodation listing"
  on public.accommodation_listings for update
  using ((auth.uid() = owner_id and public.is_active_user()) or public.is_admin())
  with check ((auth.uid() = owner_id and public.is_active_user()) or public.is_admin());

drop policy if exists "Owner or admin can delete accommodation listing" on public.accommodation_listings;
create policy "Owner or admin can delete accommodation listing"
  on public.accommodation_listings for delete
  using (auth.uid() = owner_id or public.is_admin());

drop policy if exists "Accommodation images readable with listing" on public.accommodation_images;
create policy "Accommodation images readable with listing"
  on public.accommodation_images for select
  using (
    exists (
      select 1 from public.accommodation_listings l
      where l.id = accommodation_images.listing_id
        and (l.status in ('published', 'occupied') or l.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "Listing owner manages accommodation images" on public.accommodation_images;
create policy "Listing owner manages accommodation images"
  on public.accommodation_images for all
  using (
    exists (
      select 1 from public.accommodation_listings l
      where l.id = accommodation_images.listing_id
        and (l.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.accommodation_listings l
      where l.id = accommodation_images.listing_id
        and (l.owner_id = auth.uid() or public.is_admin())
    )
  );

-- 6. FLAT REQUESTS POLICIES
drop policy if exists "Only participants or admin can read flat requests" on public.flat_requests;
create policy "Only participants or admin can read flat requests"
  on public.flat_requests for select
  using (auth.uid() in (requester_id, owner_id) or public.is_admin());

drop policy if exists "Active non-blocked student can submit flat request" on public.flat_requests;
create policy "Active non-blocked student can submit flat request"
  on public.flat_requests for insert
  with check (
    auth.uid() = requester_id
    and public.is_active_user()
    and status = 'pending'
    and not public.is_blocked_between(requester_id, owner_id)
    and exists (
      select 1 from public.accommodation_listings l
      where l.id = listing_id
        and l.owner_id = flat_requests.owner_id
        and l.status = 'published'
    )
  );

drop policy if exists "Participants can update flat request within role bounds" on public.flat_requests;
create policy "Participants can update flat request within role bounds"
  on public.flat_requests for update
  using (auth.uid() in (requester_id, owner_id) and public.is_active_user())
  with check (
    (auth.uid() = requester_id and status = 'cancelled')
    or (auth.uid() = owner_id and status in ('accepted', 'declined'))
  );

-- 7. FLATMATE CONNECTIONS POLICIES
drop policy if exists "Only participants or admin can read flatmate connections" on public.flatmate_connections;
create policy "Only participants or admin can read flatmate connections"
  on public.flatmate_connections for select
  using (auth.uid() in (sender_id, receiver_id) or public.is_admin());

drop policy if exists "Active non-blocked student can send connection request" on public.flatmate_connections;
create policy "Active non-blocked student can send connection request"
  on public.flatmate_connections for insert
  with check (
    auth.uid() = sender_id
    and public.is_active_user()
    and status = 'pending'
    and not public.is_blocked_between(sender_id, receiver_id)
  );

drop policy if exists "Participants manage connection status" on public.flatmate_connections;
create policy "Participants manage connection status"
  on public.flatmate_connections for update
  using (auth.uid() in (sender_id, receiver_id) and public.is_active_user())
  with check (
    (auth.uid() = sender_id and status = 'cancelled')
    or (auth.uid() = receiver_id and status in ('accepted', 'declined'))
  );

-- 8. BOOK LISTINGS & BOOK REQUESTS POLICIES
drop policy if exists "Public can browse available/reserved books" on public.book_listings;
create policy "Public can browse available/reserved books"
  on public.book_listings for select
  using (
    availability_status in ('available', 'reserved', 'completed')
    or donor_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "Active student can create book listing" on public.book_listings;
create policy "Active student can create book listing"
  on public.book_listings for insert
  with check (
    auth.uid() = donor_id
    and public.is_active_user()
    and availability_status in ('draft', 'available')
  );

drop policy if exists "Donor or admin can update book listing" on public.book_listings;
create policy "Donor or admin can update book listing"
  on public.book_listings for update
  using ((auth.uid() = donor_id and public.is_active_user()) or public.is_admin())
  with check ((auth.uid() = donor_id and public.is_active_user()) or public.is_admin());

drop policy if exists "Donor or admin can delete book listing" on public.book_listings;
create policy "Donor or admin can delete book listing"
  on public.book_listings for delete
  using (auth.uid() = donor_id or public.is_admin());

drop policy if exists "Only book request participants or admin can view book requests" on public.book_requests;
create policy "Only book request participants or admin can view book requests"
  on public.book_requests for select
  using (auth.uid() in (requester_id, donor_id) or public.is_admin());

drop policy if exists "Active non-blocked student can create book request" on public.book_requests;
create policy "Active non-blocked student can create book request"
  on public.book_requests for insert
  with check (
    auth.uid() = requester_id
    and public.is_active_user()
    and status = 'pending'
    and not public.is_blocked_between(requester_id, donor_id)
    and exists (
      select 1 from public.book_listings b
      where b.id = book_id
        and b.donor_id = book_requests.donor_id
        and b.availability_status = 'available'
    )
  );

drop policy if exists "Requester may cancel own pending book request" on public.book_requests;
create policy "Requester may cancel own pending book request"
  on public.book_requests for update
  using (auth.uid() = requester_id and status = 'pending' and public.is_active_user())
  with check (auth.uid() = requester_id and status = 'cancelled');

-- 9. SAVED ITEMS POLICIES
drop policy if exists "Users manage their own saved items" on public.saved_items;
create policy "Users manage their own saved items"
  on public.saved_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 10. CONVERSATIONS & MESSAGES POLICIES
drop policy if exists "Conversation participants or admin can view conversations" on public.conversations;
create policy "Conversation participants or admin can view conversations"
  on public.conversations for select
  using (auth.uid() in (participant_one, participant_two) or public.is_admin());

drop policy if exists "Conversation participants can read messages" on public.messages;
create policy "Conversation participants can read messages"
  on public.messages for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

drop policy if exists "Authorized non-blocked participant can send messages" on public.messages;
create policy "Authorized non-blocked participant can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and public.is_active_user()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.participant_one, c.participant_two)
        and not public.is_blocked_between(c.participant_one, c.participant_two)
    )
  );

drop policy if exists "Recipient can mark messages read" on public.messages;
create policy "Recipient can mark messages read"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.participant_one, c.participant_two)
    )
  )
  with check (is_read = true);

-- 11. NOTIFICATIONS POLICIES
drop policy if exists "Users view own notifications" on public.notifications;
create policy "Users view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 12. BLOCKS, REPORTS & MODERATION AUDIT POLICIES
drop policy if exists "Users manage own block list" on public.user_blocks;
create policy "Users manage own block list"
  on public.user_blocks for all
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);

drop policy if exists "Reporter or admin can read reports" on public.user_reports;
create policy "Reporter or admin can read reports"
  on public.user_reports for select
  using (auth.uid() = reporter_id or public.is_admin());

drop policy if exists "Active student can file safety report" on public.user_reports;
create policy "Active student can file safety report"
  on public.user_reports for insert
  with check (auth.uid() = reporter_id and public.is_active_user() and status = 'open');

drop policy if exists "Only admins can update safety reports" on public.user_reports;
create policy "Only admins can update safety reports"
  on public.user_reports for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can read and append moderation audit logs" on public.moderation_actions;
create policy "Only admins can read and append moderation audit logs"
  on public.moderation_actions for select
  using (public.is_admin());

drop policy if exists "Only admins can insert moderation audit logs" on public.moderation_actions;
create policy "Only admins can insert moderation audit logs"
  on public.moderation_actions for insert
  with check (public.is_admin() and admin_id = auth.uid());

-- ==============================================================================
-- SUPABASE STORAGE BUCKETS & POLICIES (5 MB limit, safe image MIME types)
-- ==============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('accommodations', 'accommodations', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('books', 'books', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read access for marketplace media" on storage.objects;
create policy "Public read access for marketplace media"
  on storage.objects for select
  using (bucket_id in ('avatars', 'accommodations', 'books'));

drop policy if exists "Users upload media into own folder" on storage.objects;
create policy "Users upload media into own folder"
  on storage.objects for insert
  with check (
    bucket_id in ('avatars', 'accommodations', 'books', 'verification-docs')
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own media objects" on storage.objects;
create policy "Users update own media objects"
  on storage.objects for update
  using (
    bucket_id in ('avatars', 'accommodations', 'books')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users or admins delete media objects" on storage.objects;
create policy "Users or admins delete media objects"
  on storage.objects for delete
  using (
    bucket_id in ('avatars', 'accommodations', 'books', 'verification-docs')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "Owner or admin reads verification documents" on storage.objects;
create policy "Owner or admin reads verification documents"
  on storage.objects for select
  using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );


-- ==============================================================================
-- CampusCircle — Migration 003: Privilege Guards, Atomic RPCs & Event Triggers
-- Idempotent: Safe to run multiple times in Supabase SQL Editor.
-- ==============================================================================

-- 1. Automatic updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_preferences_updated_at on public.student_preferences;
create trigger trg_preferences_updated_at before update on public.student_preferences
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_accommodations_updated_at on public.accommodation_listings;
create trigger trg_accommodations_updated_at before update on public.accommodation_listings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_flat_requests_updated_at on public.flat_requests;
create trigger trg_flat_requests_updated_at before update on public.flat_requests
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_flatmate_connections_updated_at on public.flatmate_connections;
create trigger trg_flatmate_connections_updated_at before update on public.flatmate_connections
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_book_listings_updated_at on public.book_listings;
create trigger trg_book_listings_updated_at before update on public.book_listings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_book_requests_updated_at on public.book_requests;
create trigger trg_book_requests_updated_at before update on public.book_requests
  for each row execute function public.touch_updated_at();

-- 2. Prevent Privilege Escalation on Profiles
-- Ordinary students CANNOT alter role, college_verified, verification_method, or is_suspended.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  internal_sync text := coalesce(current_setting('campuscircle.internal_sync', true), '');
begin
  if internal_sync = 'true'
     or current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin')
     or session_user in ('postgres', 'supabase_admin', 'supabase_auth_admin')
     or jwt_role = 'service_role'
     or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Unauthorized: Users cannot modify their account role.';
  end if;

  if new.is_suspended is distinct from old.is_suspended
     or new.suspension_reason is distinct from old.suspension_reason then
    raise exception 'Unauthorized: Users cannot modify suspension status.';
  end if;

  if new.college_verified is distinct from old.college_verified
     or new.verification_method is distinct from old.verification_method then
    raise exception 'Unauthorized: College verification status is controlled by institutional verification or moderation.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- 3. Auto-bootstrap Profile, Private Contacts & Default Preferences on Auth Sign-Up,
--    persisting signup metadata (full_name, college_name, city) and auto-verifying
--    institutional domains ONCE email_confirmed_at is set.
create or replace function public.is_institutional_college_email(email_addr text)
returns boolean
language plpgsql
immutable
as $$
declare
  domain_part text;
begin
  if email_addr is null or position('@' in email_addr) = 0 then
    return false;
  end if;
  domain_part := lower(split_part(email_addr, '@', 2));
  return (
    domain_part like '%.ac.in'
    or domain_part like '%.edu.in'
    or domain_part like '%.edu'
    or domain_part in (
      'annauniv.edu',
      'iitm.ac.in',
      'smail.iitm.ac.in',
      'christuniversity.in',
      'bits-pilani.ac.in',
      'iisc.ac.in',
      'srmist.edu.in',
      'psgtech.ac.in',
      'loyolacollege.edu'
    )
  );
end;
$$;

create or replace function public.handle_auth_user_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_email text := coalesce(new.email, '');
  extracted_domain text := case when position('@' in coalesce(new.email, '')) > 0
    then lower(split_part(new.email, '@', 2))
    else null
  end;
  auto_verified boolean := (new.email_confirmed_at is not null and public.is_institutional_college_email(new.email));
  meta_full_name text := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), '');
  meta_college text := coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'college_name', '')), ''), '');
  meta_city text := coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'city', '')), ''), 'Chennai');
  meta_avatar text := nullif(trim(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')), '');
begin
  perform set_config('campuscircle.internal_sync', 'true', true);

  insert into public.profiles (
    id,
    email,
    full_name,
    college_name,
    city,
    avatar_url,
    college_domain,
    college_verified,
    verification_method
  )
  values (
    new.id,
    safe_email,
    coalesce(meta_full_name, nullif(split_part(safe_email, '@', 1), ''), 'Student'),
    meta_college,
    meta_city,
    meta_avatar,
    extracted_domain,
    auto_verified,
    case when auto_verified then 'domain_email' else null end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = case
      when nullif(trim(public.profiles.full_name), '') is null then excluded.full_name
      else public.profiles.full_name
    end,
    college_name = case
      when nullif(trim(public.profiles.college_name), '') is null and excluded.college_name <> '' then excluded.college_name
      else public.profiles.college_name
    end,
    city = case
      when nullif(trim(public.profiles.city), '') is null then excluded.city
      else public.profiles.city
    end,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    college_domain = excluded.college_domain,
    college_verified = (public.profiles.college_verified or auto_verified),
    verification_method = coalesce(
      public.profiles.verification_method,
      case when auto_verified then 'domain_email' else null end
    );

  insert into public.profile_private_contacts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.student_preferences (user_id, preferred_city)
  values (new.id, meta_city)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_or_confirmed on auth.users;
create trigger on_auth_user_created_or_confirmed
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_auth_user_sync();

-- 4. Atomic Book Request & Handover Lifecycle RPC
-- Enforces reservation exclusivity, participant authorization, notifications, and chat creation.
create or replace function public.transition_book_request(
  p_request_id uuid,
  p_action text, -- 'accept' | 'decline' | 'schedule_handover' | 'confirm_handover' | 'cancel'
  p_scheduled_spot text default null,
  p_scheduled_time text default null
)
returns public.book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.book_requests;
  v_book public.book_listings;
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Authentication required.';
  end if;

  select * into v_req
  from public.book_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Book request not found.';
  end if;

  select * into v_book
  from public.book_listings
  where id = v_req.book_id
  for update;

  if v_actor not in (v_req.donor_id, v_req.requester_id) then
    raise exception 'Unauthorized: Only request participants may update this book request.';
  end if;

  if p_action = 'accept' then
    if v_actor <> v_req.donor_id then
      raise exception 'Only the book donor can accept a request.';
    end if;
    if v_req.status <> 'pending' then
      raise exception 'Only pending requests can be accepted.';
    end if;
    if v_book.availability_status <> 'available' then
      raise exception 'This book already has an active reservation.';
    end if;

    update public.book_requests
    set status = 'reserved',
        proposed_spot = coalesce(nullif(trim(p_scheduled_spot), ''), proposed_spot),
        proposed_time = coalesce(nullif(trim(p_scheduled_time), ''), proposed_time)
    where id = p_request_id
    returning * into v_req;

    update public.book_listings
    set availability_status = 'reserved'
    where id = v_book.id;

    insert into public.conversations (participant_one, participant_two, context_type, context_id, context_title)
    values (v_req.donor_id, v_req.requester_id, 'book_request', v_req.id, v_book.title)
    on conflict (context_type, context_id) do nothing;

    insert into public.notifications (user_id, category, title, body, action_path)
    values (
      v_req.requester_id,
      'book_request',
      'Book Request Accepted',
      format('Your request for "%s" is now reserved for campus handover.', v_book.title),
      '/activity?tab=books'
    );

  elsif p_action = 'decline' then
    if v_actor <> v_req.donor_id then
      raise exception 'Only the book donor can decline a request.';
    end if;
    if v_req.status <> 'pending' then
      raise exception 'Only pending requests can be declined.';
    end if;

    update public.book_requests
    set status = 'declined'
    where id = p_request_id
    returning * into v_req;

    insert into public.notifications (user_id, category, title, body, action_path)
    values (
      v_req.requester_id,
      'book_request',
      'Book Request Declined',
      format('The donor declined your request for "%s".', v_book.title),
      '/activity?tab=books'
    );

  elsif p_action = 'schedule_handover' then
    if v_req.status not in ('accepted', 'reserved', 'handover_scheduled') then
      raise exception 'Request must be reserved before scheduling handover.';
    end if;

    update public.book_requests
    set status = 'handover_scheduled',
        proposed_spot = coalesce(nullif(trim(p_scheduled_spot), ''), proposed_spot),
        proposed_time = coalesce(nullif(trim(p_scheduled_time), ''), proposed_time),
        handover_scheduled_at = now()
    where id = p_request_id
    returning * into v_req;

    insert into public.notifications (user_id, category, title, body, action_path)
    values (
      case when v_actor = v_req.donor_id then v_req.requester_id else v_req.donor_id end,
      'handover',
      'Campus Handover Scheduled',
      format('"%s" pickup updated: %s at %s.', v_book.title, v_req.proposed_time, v_req.proposed_spot),
      '/activity?tab=books'
    );

  elsif p_action = 'confirm_handover' then
    if v_req.status not in ('accepted', 'reserved', 'handover_scheduled') then
      raise exception 'Handover can only be confirmed on an active reserved book.';
    end if;

    update public.book_requests
    set donor_confirmed = case when v_actor = donor_id then true else donor_confirmed end,
        requester_confirmed = case when v_actor = requester_id then true else requester_confirmed end
    where id = p_request_id
    returning * into v_req;

    if v_req.donor_confirmed and v_req.requester_confirmed then
      update public.book_requests
      set status = 'completed',
          completed_at = now()
      where id = p_request_id
      returning * into v_req;

      update public.book_listings
      set availability_status = 'completed'
      where id = v_book.id;

      insert into public.notifications (user_id, category, title, body, action_path)
      values
        (v_req.donor_id, 'handover', 'Handover Completed', format('Both students confirmed handover for "%s".', v_book.title), '/activity?tab=books'),
        (v_req.requester_id, 'handover', 'Handover Completed', format('Both students confirmed handover for "%s".', v_book.title), '/activity?tab=books');
    else
      insert into public.notifications (user_id, category, title, body, action_path)
      values (
        case when v_actor = v_req.donor_id then v_req.requester_id else v_req.donor_id end,
        'handover',
        'Awaiting Your Handover Confirmation',
        format('Your peer confirmed the campus handover for "%s". Please confirm once received.', v_book.title),
        '/activity?tab=books'
      );
    end if;

  elsif p_action = 'cancel' then
    if v_req.status in ('completed', 'declined', 'cancelled') then
      raise exception 'Request is already closed.';
    end if;

    if v_req.status in ('accepted', 'reserved', 'handover_scheduled') then
      update public.book_listings
      set availability_status = 'available'
      where id = v_book.id;
    end if;

    update public.book_requests
    set status = 'cancelled',
        donor_confirmed = false,
        requester_confirmed = false
    where id = p_request_id
    returning * into v_req;

    insert into public.notifications (user_id, category, title, body, action_path)
    values (
      case when v_actor = v_req.donor_id then v_req.requester_id else v_req.donor_id end,
      'book_request',
      'Book Reservation Cancelled',
      format('The reservation for "%s" was cancelled and the book is available again.', v_book.title),
      '/activity?tab=books'
    );
  else
    raise exception 'Unsupported book request action: %', p_action;
  end if;

  return v_req;
end;
$$;

-- 5. Event Triggers for New Requests, Accepted Connections & Messages
create or replace function public.notify_on_new_book_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book_title text;
begin
  select title into v_book_title from public.book_listings where id = new.book_id;
  insert into public.notifications (user_id, category, title, body, action_path)
  values (
    new.donor_id,
    'book_request',
    'New Textbook Request',
    format('A student requested "%s" (pickup: %s).', coalesce(v_book_title, 'your book'), new.proposed_spot),
    '/activity?tab=books'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_new_book_request on public.book_requests;
create trigger trg_notify_new_book_request
  after insert on public.book_requests
  for each row execute function public.notify_on_new_book_request();

create or replace function public.handle_flat_request_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from public.accommodation_listings where id = new.listing_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, category, title, body, action_path)
    values (
      new.owner_id,
      'flat_request',
      'New Room Interest Received',
      format('A student expressed interest in "%s".', coalesce(v_title, 'your listing')),
      '/activity?tab=flats'
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'accepted' then
      insert into public.conversations (participant_one, participant_two, context_type, context_id, context_title)
      values (new.owner_id, new.requester_id, 'flat_request', new.id, coalesce(v_title, 'Room Inquiry'))
      on conflict (context_type, context_id) do nothing;

      insert into public.notifications (user_id, category, title, body, action_path)
      values (
        new.requester_id,
        'flat_request',
        'Room Inquiry Accepted',
        format('The owner accepted your inquiry for "%s". Chat is now open.', coalesce(v_title, 'the room')),
        '/messages'
      );
    elsif new.status = 'declined' then
      insert into public.notifications (user_id, category, title, body, action_path)
      values (
        new.requester_id,
        'flat_request',
        'Room Inquiry Update',
        format('Your inquiry for "%s" was declined by the owner.', coalesce(v_title, 'the room')),
        '/activity?tab=flats'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flat_request_events on public.flat_requests;
create trigger trg_flat_request_events
  after insert or update on public.flat_requests
  for each row execute function public.handle_flat_request_events();

create or replace function public.handle_flatmate_connection_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
  v_receiver_name text;
begin
  select full_name into v_sender_name from public.profiles where id = new.sender_id;
  select full_name into v_receiver_name from public.profiles where id = new.receiver_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, category, title, body, action_path)
    values (
      new.receiver_id,
      'flatmate_match',
      'New Flatmate Connection Request',
      format('%s (%s%% match) wants to connect as a flatmate.', coalesce(nullif(v_sender_name, ''), 'A campus peer'), new.compatibility_score),
      '/activity?tab=connections'
    );
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.conversations (participant_one, participant_two, context_type, context_id, context_title)
    values (new.sender_id, new.receiver_id, 'flatmate_connection', new.id, 'Flatmate Match')
    on conflict (context_type, context_id) do nothing;

    insert into public.notifications (user_id, category, title, body, action_path)
    values (
      new.sender_id,
      'flatmate_match',
      'Flatmate Intro Accepted!',
      format('%s accepted your flatmate intro! Chat is now open.', coalesce(nullif(v_receiver_name, ''), 'Your peer')),
      '/messages'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flatmate_connection_events on public.flatmate_connections;
create trigger trg_flatmate_connection_events
  after insert or update on public.flatmate_connections
  for each row execute function public.handle_flatmate_connection_events();

create or replace function public.handle_new_message_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations;
  v_recipient uuid;
  v_sender_name text;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  v_recipient := case when v_conv.participant_one = new.sender_id then v_conv.participant_two else v_conv.participant_one end;
  select full_name into v_sender_name from public.profiles where id = new.sender_id;

  update public.conversations
  set last_message_preview = left(new.body, 120),
      last_message_at = new.created_at
  where id = new.conversation_id;

  insert into public.notifications (user_id, category, title, body, action_path)
  values (
    v_recipient,
    'message',
    format('New message from %s', coalesce(nullif(v_sender_name, ''), 'Campus Peer')),
    left(new.body, 100),
    format('/messages/%s', new.conversation_id)
  );
  return new;
end;
$$;

drop trigger if exists trg_new_message_events on public.messages;
create trigger trg_new_message_events
  after insert on public.messages
  for each row execute function public.handle_new_message_events();

-- 6. Admin Moderation Atomic RPC (Enforces admin check + immutable audit record)
create or replace function public.perform_moderation_action(
  p_action_type text,
  p_target_user_id uuid default null,
  p_target_entity_id uuid default null,
  p_reason text default ''
)
returns public.moderation_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit public.moderation_actions;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: Administrator privileges required.';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A clear moderation reason (at least 3 characters) is required.';
  end if;

  perform set_config('campuscircle.internal_sync', 'true', true);

  if p_action_type = 'approve_verification' then
    update public.college_verification_requests
    set status = 'approved', reviewer_id = auth.uid(), review_notes = p_reason, reviewed_at = now()
    where id = p_target_entity_id;

    update public.profiles
    set college_verified = true, verification_method = 'admin_id_review'
    where id = p_target_user_id;

    insert into public.notifications (user_id, category, title, body, action_path)
    values (p_target_user_id, 'verification', 'College ID Verified ✓', 'Your student ID verification was approved by CampusCircle moderation.', '/profile');

  elsif p_action_type = 'reject_verification' then
    update public.college_verification_requests
    set status = 'rejected', reviewer_id = auth.uid(), review_notes = p_reason, reviewed_at = now()
    where id = p_target_entity_id;

    insert into public.notifications (user_id, category, title, body, action_path)
    values (p_target_user_id, 'verification', 'Verification Update', format('Your ID submission needs attention: %s', p_reason), '/profile');

  elsif p_action_type = 'remove_flat_listing' then
    update public.accommodation_listings set status = 'removed' where id = p_target_entity_id;
  elsif p_action_type = 'restore_flat_listing' then
    update public.accommodation_listings set status = 'published' where id = p_target_entity_id;
  elsif p_action_type = 'remove_book_listing' then
    update public.book_listings set availability_status = 'removed' where id = p_target_entity_id;
  elsif p_action_type = 'restore_book_listing' then
    update public.book_listings set availability_status = 'available' where id = p_target_entity_id;
  elsif p_action_type = 'suspend_user' then
    if p_target_user_id = auth.uid() then
      raise exception 'Administrators cannot suspend their own account.';
    end if;
    update public.profiles set is_suspended = true, suspension_reason = p_reason where id = p_target_user_id;
  elsif p_action_type = 'restore_user' then
    update public.profiles set is_suspended = false, suspension_reason = null where id = p_target_user_id;
  elsif p_action_type in ('resolve_report', 'dismiss_report') then
    update public.user_reports
    set status = case when p_action_type = 'resolve_report' then 'resolved' else 'dismissed' end,
        resolution_notes = p_reason,
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = p_target_entity_id;
  else
    raise exception 'Unsupported moderation action: %', p_action_type;
  end if;

  insert into public.moderation_actions (admin_id, action_type, target_user_id, target_entity_id, reason)
  values (auth.uid(), p_action_type, p_target_user_id, p_target_entity_id, p_reason)
  returning * into v_audit;

  return v_audit;
end;
$$;

-- Enable Supabase Realtime publication for live messages and notifications
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- Refresh PostgREST schema cache immediately
notify pgrst, 'reload schema';
