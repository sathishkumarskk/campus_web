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
