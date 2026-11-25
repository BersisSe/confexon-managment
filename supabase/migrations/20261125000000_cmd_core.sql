-- Confexon Commander: core schema (DRAFT, not applied).
-- Roster is a snapshot of Confexon allocations, so chairs never need read access
-- to applications / receipts / PII tables.

create table public.cmd_committees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create table public.cmd_chairs (
  committee_id uuid not null references public.cmd_committees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'chair' check (role in ('head_chair','chair','rapporteur')),
  primary key (committee_id, user_id)
);

create table public.cmd_delegates (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.cmd_committees(id) on delete cascade,
  source text not null check (source in ('application','imported_applicant','imported_member')),
  source_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  country text not null,
  unique (committee_id, source, source_id)
);

create table public.cmd_sessions (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.cmd_committees(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open','closed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.cmd_attendance (
  session_id uuid not null references public.cmd_sessions(id) on delete cascade,
  delegate_id uuid not null references public.cmd_delegates(id) on delete cascade,
  status text not null check (status in ('present','present_voting','absent')),
  updated_at timestamptz not null default now(),
  primary key (session_id, delegate_id)
);

create table public.cmd_speakers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cmd_sessions(id) on delete cascade,
  delegate_id uuid not null references public.cmd_delegates(id) on delete cascade,
  position int not null,
  duration_seconds int not null default 90,
  started_at timestamptz,   -- timers are timestamps, not counters
  finished_at timestamptz
);

create table public.cmd_log (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.cmd_sessions(id) on delete cascade,
  actor_id uuid references auth.users(id),
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Access helpers
create function public.cmd_can_manage(p_committee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cmd_chairs where committee_id = p_committee and user_id = auth.uid())
      or exists (select 1 from cmd_committees c where c.id = p_committee and is_event_admin(c.event_id::text));
$$;

create function public.cmd_session_committee(p_session uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select committee_id from cmd_sessions where id = p_session;
$$;

-- Snapshot sync: pulls committees + allocated delegates from Confexon tables.
create function public.cmd_sync_roster(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_event_admin(p_event::text) then raise exception 'not allowed'; end if;

  insert into cmd_committees (event_id, name, sort_order)
  select p_event, (c->>'name'), (ord - 1)::int
  from events e, jsonb_array_elements(e.committee_structure) with ordinality as t(c, ord)
  where e.id = p_event
  on conflict (event_id, name) do nothing;

  insert into cmd_delegates (committee_id, source, source_id, user_id, display_name, country)
  select c.id, 'application', a.id::text, a."user", coalesce(p.full_name, '—'), a.alloc_country
  from event_delegate_applications a
  join cmd_committees c on c.event_id = a.event and c.name = a.alloc_committee
  left join profiles p on p.id = a."user"
  where a.event = p_event and a.alloc_country is not null
  on conflict (committee_id, source, source_id) do update
    set display_name = excluded.display_name, country = excluded.country, user_id = excluded.user_id;

  insert into cmd_delegates (committee_id, source, source_id, user_id, display_name, country)
  select c.id, 'imported_applicant', i.id::text, i.user_id, i.full_name, i.alloc_country
  from event_imported_applicants i
  join cmd_committees c on c.event_id = i.event_id and c.name = i.alloc_committee
  where i.event_id = p_event and i.alloc_country is not null
  on conflict (committee_id, source, source_id) do update
    set display_name = excluded.display_name, country = excluded.country, user_id = excluded.user_id;

  insert into cmd_delegates (committee_id, source, source_id, user_id, display_name, country)
  select c.id, 'imported_member', m.id::text, m.user_id, m.full_name, m.alloc_country
  from event_imported_party_members m
  join event_imported_parties pt on pt.id = m.imported_party_id
  join cmd_committees c on c.event_id = pt.event_id and c.name = m.alloc_committee
  where pt.event_id = p_event and m.alloc_country is not null
  on conflict (committee_id, source, source_id) do update
    set display_name = excluded.display_name, country = excluded.country, user_id = excluded.user_id;
end $$;

-- RLS
alter table cmd_committees enable row level security;
alter table cmd_chairs enable row level security;
alter table cmd_delegates enable row level security;
alter table cmd_sessions enable row level security;
alter table cmd_attendance enable row level security;
alter table cmd_speakers enable row level security;
alter table cmd_log enable row level security;

create policy cmd_committees_read on cmd_committees for select to authenticated
  using (cmd_can_manage(id));
create policy cmd_chairs_read on cmd_chairs for select to authenticated
  using (user_id = auth.uid() or cmd_can_manage(committee_id));
create policy cmd_chairs_write on cmd_chairs for all to authenticated
  using (exists (select 1 from cmd_committees c where c.id = committee_id and is_event_owner_level(c.event_id::text)))
  with check (exists (select 1 from cmd_committees c where c.id = committee_id and is_event_owner_level(c.event_id::text)));
create policy cmd_delegates_read on cmd_delegates for select to authenticated
  using (cmd_can_manage(committee_id));
create policy cmd_sessions_all on cmd_sessions for all to authenticated
  using (cmd_can_manage(committee_id)) with check (cmd_can_manage(committee_id));
create policy cmd_attendance_all on cmd_attendance for all to authenticated
  using (cmd_can_manage(cmd_session_committee(session_id))) with check (cmd_can_manage(cmd_session_committee(session_id)));
create policy cmd_speakers_all on cmd_speakers for all to authenticated
  using (cmd_can_manage(cmd_session_committee(session_id))) with check (cmd_can_manage(cmd_session_committee(session_id)));
create policy cmd_log_all on cmd_log for all to authenticated
  using (cmd_can_manage(cmd_session_committee(session_id))) with check (cmd_can_manage(cmd_session_committee(session_id)));

revoke execute on function cmd_sync_roster(uuid) from public, anon;
grant execute on function cmd_sync_roster(uuid) to authenticated;
