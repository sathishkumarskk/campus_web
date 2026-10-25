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
