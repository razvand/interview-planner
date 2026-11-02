-- Interview Planner: initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Model
--   admin_emails     who is an Administrator (by sign-in email)
--   sessions         an interview session (start date, end date, status)
--   session_members  teachers (and optionally students) invited to a session, by email
--   slots            a teacher's 1-hour availability slot
--   subslots         10 x 5-minute subslots generated per slot (last 10 minutes are buffer)
--   bookings         one subslot per student per session; may be changed once
--
-- Students never read slots/subslots directly: they go through SECURITY DEFINER
-- functions that return times only, so teacher identity is never exposed to them.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- helpers

create or replace function public.auth_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- ---------------------------------------------------------------- tables

create table public.admin_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create type public.session_status as enum ('draft', 'open', 'closed');

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Europe/Bucharest',
  status public.session_status not null default 'draft',
  -- 'invited': only students listed in session_members may book
  -- 'open':    any signed-in user may book (optionally restricted to allowed_domain)
  student_access text not null default 'invited' check (student_access in ('invited', 'open')),
  allowed_domain text check (allowed_domain is null or allowed_domain = lower(allowed_domain)),
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.session_members (
  session_id uuid not null references public.sessions on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('teacher', 'student')),
  created_at timestamptz not null default now(),
  primary key (session_id, email)
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  teacher_id uuid not null references auth.users on delete cascade default auth.uid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  -- a teacher cannot have overlapping hours
  constraint slots_no_overlap exclude using gist (
    teacher_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
);
create index on public.slots (session_id);

create table public.subslots (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots on delete cascade,
  session_id uuid not null references public.sessions on delete cascade,
  idx smallint not null check (idx between 0 and 9),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unique (slot_id, idx)
);
create index on public.subslots (session_id, starts_at);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  student_id uuid not null references auth.users on delete cascade,
  -- NO ACTION (default): a slot with bookings cannot be deleted
  subslot_id uuid not null unique references public.subslots,
  change_count int not null default 0 check (change_count between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

-- ---------------------------------------------------------------- role checks

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_emails where email = public.auth_email());
$$;

create or replace function public.is_teacher(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from session_members
    where session_id = p_session and email = public.auth_email() and role = 'teacher'
  );
$$;

create or replace function public.email_in_domain(p_email text, p_domain text)
returns boolean language sql immutable as $$
  select p_domain is null
      or split_part(p_email, '@', 2) = p_domain
      or split_part(p_email, '@', 2) like '%.' || p_domain;
$$;

-- may the current user see this session as a student?
create or replace function public.is_student(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from sessions s
    where s.id = p_session
      and s.status <> 'draft'
      and not public.is_teacher(s.id)
      and (
        exists (select 1 from session_members m
                where m.session_id = s.id and m.email = public.auth_email() and m.role = 'student')
        or (s.student_access = 'open' and public.email_in_domain(public.auth_email(), s.allowed_domain))
      )
  );
$$;

create or replace function public.can_book(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_student(p_session)
     and exists (select 1 from sessions where id = p_session and status = 'open');
$$;

-- ---------------------------------------------------------------- triggers

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.slots_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s sessions;
  local_day date;
begin
  if tg_op = 'UPDATE' then
    if new.starts_at <> old.starts_at or new.teacher_id <> old.teacher_id or new.session_id <> old.session_id then
      raise exception 'A slot cannot be moved; delete it and create a new one.';
    end if;
    new.ends_at := old.ends_at;
    return new;
  end if;

  select * into s from sessions where id = new.session_id;
  if s.status = 'closed' then
    raise exception 'This session is closed.';
  end if;
  local_day := (new.starts_at at time zone s.timezone)::date;
  if local_day < s.start_date or local_day > s.end_date then
    raise exception 'The slot must fall between % and %.', s.start_date, s.end_date;
  end if;
  new.ends_at := new.starts_at + interval '1 hour';
  return new;
end $$;

create trigger slots_before_write
  before insert or update on public.slots
  for each row execute function public.slots_before_write();

-- 10 subslots of 5 minutes; minutes 50-60 are the buffer
create or replace function public.slots_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into subslots (slot_id, session_id, idx, starts_at, ends_at)
  select new.id, new.session_id, i,
         new.starts_at + make_interval(mins => i * 5),
         new.starts_at + make_interval(mins => i * 5 + 5)
  from generate_series(0, 9) as i;
  return new;
end $$;

create trigger slots_after_insert
  after insert on public.slots
  for each row execute function public.slots_after_insert();

-- ---------------------------------------------------------------- row level security

alter table public.admin_emails    enable row level security;
alter table public.profiles        enable row level security;
alter table public.sessions        enable row level security;
alter table public.session_members enable row level security;
alter table public.slots           enable row level security;
alter table public.subslots        enable row level security;
alter table public.bookings        enable row level security;

-- admin_emails
create policy "admins read admins, users read self" on public.admin_emails
  for select to authenticated using (email = public.auth_email() or public.is_admin());
create policy "admins manage admins" on public.admin_emails
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: own profile; admins see all. Only full_name is user-editable.
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

-- sessions
create policy "see relevant sessions" on public.sessions
  for select to authenticated
  using (public.is_admin() or public.is_teacher(id) or public.is_student(id));
create policy "admins manage sessions" on public.sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- session_members
create policy "see own membership" on public.session_members
  for select to authenticated using (email = public.auth_email() or public.is_admin());
create policy "admins manage members" on public.session_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- slots: teachers manage their own; admins everything. Students: no direct access.
create policy "teachers read own slots" on public.slots
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "teachers add own slots" on public.slots
  for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_teacher(session_id));
create policy "teachers update own slots" on public.slots
  for update to authenticated
  using (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());
create policy "teachers delete own slots" on public.slots
  for delete to authenticated using (teacher_id = auth.uid() or public.is_admin());

-- subslots: read via slot ownership; written only by trigger
create policy "teachers read own subslots" on public.subslots
  for select to authenticated
  using (public.is_admin() or exists (select 1 from public.slots s where s.id = slot_id and s.teacher_id = auth.uid()));

-- bookings: students read their own row; admins read/delete. Writes go through book_subslot().
create policy "students read own booking" on public.bookings
  for select to authenticated using (student_id = auth.uid() or public.is_admin());
create policy "admins delete bookings" on public.bookings
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- API (RPC)

-- Free, published, future subslots in a session. Times only: no teacher info.
create or replace function public.available_subslots(p_session uuid)
returns table (subslot_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_student(p_session) then
    raise exception 'You are not enrolled in this session.';
  end if;
  return query
    select ss.id, ss.starts_at, ss.ends_at
    from subslots ss
    join slots s on s.id = ss.slot_id
    where ss.session_id = p_session
      and s.published
      and ss.starts_at > now()
      and not exists (select 1 from bookings b where b.subslot_id = ss.id)
    order by ss.starts_at, ss.id;
end $$;

-- The current student's bookings (times only).
create or replace function public.my_bookings()
returns table (session_id uuid, subslot_id uuid, starts_at timestamptz, ends_at timestamptz,
               change_count int, changes_left int)
language sql stable security definer set search_path = public as $$
  select b.session_id, b.subslot_id, ss.starts_at, ss.ends_at, b.change_count, 1 - b.change_count
  from bookings b join subslots ss on ss.id = b.subslot_id
  where b.student_id = auth.uid();
$$;

-- Book a subslot, or change the existing booking (allowed once per session).
create or replace function public.book_subslot(p_subslot uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_session uuid;
  v_booking bookings;
  v_current_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Please sign in.';
  end if;

  select ss.session_id into v_session
  from subslots ss join slots s on s.id = ss.slot_id
  where ss.id = p_subslot and s.published and ss.starts_at > now();
  if v_session is null then
    raise exception 'This slot is no longer available.';
  end if;

  if not public.can_book(v_session) then
    raise exception 'Booking is not open for you in this session.';
  end if;

  select * into v_booking from bookings
  where session_id = v_session and student_id = auth.uid()
  for update;

  if found then
    if v_booking.subslot_id = p_subslot then
      return;
    end if;
    if v_booking.change_count >= 1 then
      raise exception 'You have already changed your slot once.';
    end if;
    select starts_at into v_current_start from subslots where id = v_booking.subslot_id;
    if v_current_start <= now() then
      raise exception 'Your interview has already started or passed.';
    end if;
    update bookings
       set subslot_id = p_subslot, change_count = change_count + 1, updated_at = now()
     where id = v_booking.id;
  else
    insert into bookings (session_id, student_id, subslot_id)
    values (v_session, auth.uid(), p_subslot);
  end if;
exception
  when unique_violation then
    raise exception 'This slot was just taken. Please pick another one.';
end $$;

-- Teacher view of a session: own slots with who booked each subslot.
-- Admins may pass p_all => true to see every teacher.
create or replace function public.session_schedule(p_session uuid, p_all boolean default false)
returns table (
  slot_id uuid, slot_starts_at timestamptz, published boolean,
  teacher_id uuid, teacher_email text, teacher_name text,
  subslot_id uuid, idx smallint, starts_at timestamptz, ends_at timestamptz,
  booking_id uuid, student_id uuid, student_email text, student_name text, change_count int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_all and not public.is_admin() then
    raise exception 'Only administrators can see all teachers.';
  end if;
  if not p_all and not public.is_teacher(p_session) and not public.is_admin() then
    raise exception 'You are not a teacher in this session.';
  end if;
  return query
    select s.id, s.starts_at, s.published,
           s.teacher_id, tp.email, tp.full_name,
           ss.id, ss.idx, ss.starts_at, ss.ends_at,
           b.id, b.student_id, sp.email, sp.full_name, b.change_count
    from slots s
    join subslots ss on ss.slot_id = s.id
    left join profiles tp on tp.id = s.teacher_id
    left join bookings b on b.subslot_id = ss.id
    left join profiles sp on sp.id = b.student_id
    where s.session_id = p_session
      and (p_all or s.teacher_id = auth.uid())
    order by s.starts_at, tp.email, ss.idx;
end $$;

-- Lock down function execution to signed-in users.
revoke execute on function public.available_subslots(uuid)        from public, anon;
revoke execute on function public.my_bookings()                   from public, anon;
revoke execute on function public.book_subslot(uuid)              from public, anon;
revoke execute on function public.session_schedule(uuid, boolean) from public, anon;
grant  execute on function public.available_subslots(uuid)        to authenticated;
grant  execute on function public.my_bookings()                   to authenticated;
grant  execute on function public.book_subslot(uuid)              to authenticated;
grant  execute on function public.session_schedule(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- bootstrap
-- Make yourself the first administrator (replace the email), then sign in:
--   insert into public.admin_emails (email) values ('you@upb.ro');
