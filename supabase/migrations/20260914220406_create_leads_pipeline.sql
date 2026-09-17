begin;

create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'source'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'platform'
  ) then
    alter table public.leads rename column source to platform;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'source'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'platform'
  ) then
    update public.leads set platform = coalesce(platform, source, 'landing');
    alter table public.leads drop column source;
  end if;
end
$$;

alter table public.leads
  add column if not exists platform text default 'landing',
  add column if not exists source_detail text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists gclid text,
  add column if not exists fbclid text,
  add column if not exists registered_at timestamptz,
  add column if not exists scheduled_at timestamptz,
  add column if not exists calendar_event_id text,
  add column if not exists odoo_lead_id bigint,
  add column if not exists odoo_sync_status text default 'pending',
  add column if not exists odoo_sync_error text,
  add column if not exists odoo_synced_at timestamptz,
  add column if not exists source_version bigint default 1,
  add column if not exists odoo_synced_version bigint,
  add column if not exists updated_at timestamptz default now();

update public.leads
set
  platform = coalesce(platform, 'landing'),
  odoo_sync_status = coalesce(odoo_sync_status, 'pending'),
  source_version = coalesce(source_version, 1),
  updated_at = coalesce(updated_at, created_at, now())
where platform is null
  or odoo_sync_status is null
  or source_version is null
  or updated_at is null;

alter table public.leads
  alter column platform set default 'landing',
  alter column platform set not null,
  alter column odoo_sync_status set default 'pending',
  alter column odoo_sync_status set not null,
  alter column source_version set default 1,
  alter column source_version set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
declare
  invalid_rows bigint;
begin
  select count(*) into invalid_rows
  from public.leads
  where name <> btrim(name)
    or char_length(name) not between 2 and 120
    or email <> btrim(email)
    or char_length(email) not between 3 and 254
    or email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or country_code !~ '^\+[1-9][0-9]{0,2}$'
    or phone <> btrim(phone)
    or char_length(phone) not between 7 and 32
    or phone_normalized !~ '^\+[1-9][0-9]{7,14}$'
    or activity <> btrim(activity)
    or char_length(activity) not between 1 and 160
    or advice <> btrim(advice)
    or char_length(advice) not between 1 and 160
    or (question is not null and char_length(question) > 2000)
    or status not in ('new', 'contacted', 'qualified', 'scheduled', 'won', 'lost', 'spam')
    or platform !~ '^[a-z0-9][a-z0-9_-]{0,79}$';

  if invalid_rows > 0 then
    raise exception 'Cannot apply leads constraints: % existing row(s) need cleanup', invalid_rows;
  end if;

  if exists (
    select submission_id from public.leads group by submission_id having count(*) > 1
  ) then
    raise exception 'Cannot enforce lead idempotency: duplicate submission_id values exist';
  end if;

  if exists (
    select odoo_lead_id
    from public.leads
    where odoo_lead_id is not null
    group by odoo_lead_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce Odoo uniqueness: duplicate odoo_lead_id values exist';
  end if;
end
$$;

alter table public.leads
  drop constraint if exists leads_name_length_check,
  drop constraint if exists leads_name_check,
  drop constraint if exists leads_email_check,
  drop constraint if exists leads_country_code_check,
  drop constraint if exists leads_phone_length_check,
  drop constraint if exists leads_phone_check,
  drop constraint if exists leads_phone_normalized_check,
  drop constraint if exists leads_activity_length_check,
  drop constraint if exists leads_activity_check,
  drop constraint if exists leads_advice_length_check,
  drop constraint if exists leads_advice_check,
  drop constraint if exists leads_question_length_check,
  drop constraint if exists leads_question_check,
  drop constraint if exists leads_status_check,
  drop constraint if exists leads_source_length_check,
  drop constraint if exists leads_platform_check,
  drop constraint if exists leads_source_detail_check,
  drop constraint if exists leads_utm_source_check,
  drop constraint if exists leads_utm_medium_check,
  drop constraint if exists leads_utm_campaign_check,
  drop constraint if exists leads_utm_content_check,
  drop constraint if exists leads_utm_term_check,
  drop constraint if exists leads_gclid_check,
  drop constraint if exists leads_fbclid_check,
  drop constraint if exists leads_calendar_event_id_check,
  drop constraint if exists leads_odoo_lead_id_check,
  drop constraint if exists leads_odoo_sync_status_check,
  drop constraint if exists leads_odoo_sync_error_check,
  drop constraint if exists leads_source_version_check,
  drop constraint if exists leads_synced_version_check;

alter table public.leads
  add constraint leads_name_check check (
    name = btrim(name) and char_length(name) between 2 and 120
  ),
  add constraint leads_email_check check (
    email = btrim(email)
    and char_length(email) between 3 and 254
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  add constraint leads_country_code_check check (
    country_code ~ '^\+[1-9][0-9]{0,2}$'
  ),
  add constraint leads_phone_check check (
    phone = btrim(phone) and char_length(phone) between 7 and 32
  ),
  add constraint leads_phone_normalized_check check (
    phone_normalized ~ '^\+[1-9][0-9]{7,14}$'
  ),
  add constraint leads_activity_check check (
    activity = btrim(activity) and char_length(activity) between 1 and 160
  ),
  add constraint leads_advice_check check (
    advice = btrim(advice) and char_length(advice) between 1 and 160
  ),
  add constraint leads_question_check check (
    question is null or char_length(question) <= 2000
  ),
  add constraint leads_status_check check (
    status in ('new', 'contacted', 'qualified', 'scheduled', 'won', 'lost', 'spam')
  ),
  add constraint leads_platform_check check (
    platform ~ '^[a-z0-9][a-z0-9_-]{0,79}$'
  ),
  add constraint leads_source_detail_check check (
    source_detail is null or char_length(source_detail) <= 160
  ),
  add constraint leads_utm_source_check check (
    utm_source is null or char_length(utm_source) <= 100
  ),
  add constraint leads_utm_medium_check check (
    utm_medium is null or char_length(utm_medium) <= 100
  ),
  add constraint leads_utm_campaign_check check (
    utm_campaign is null or char_length(utm_campaign) <= 200
  ),
  add constraint leads_utm_content_check check (
    utm_content is null or char_length(utm_content) <= 200
  ),
  add constraint leads_utm_term_check check (
    utm_term is null or char_length(utm_term) <= 200
  ),
  add constraint leads_gclid_check check (
    gclid is null or char_length(gclid) <= 512
  ),
  add constraint leads_fbclid_check check (
    fbclid is null or char_length(fbclid) <= 512
  ),
  add constraint leads_calendar_event_id_check check (
    calendar_event_id is null or char_length(calendar_event_id) <= 255
  ),
  add constraint leads_odoo_lead_id_check check (
    odoo_lead_id is null or odoo_lead_id > 0
  ),
  add constraint leads_odoo_sync_status_check check (
    odoo_sync_status in ('pending', 'synced', 'failed', 'skipped')
  ),
  add constraint leads_odoo_sync_error_check check (
    odoo_sync_error is null or char_length(odoo_sync_error) <= 4000
  ),
  add constraint leads_source_version_check check (
    source_version > 0
  ),
  add constraint leads_synced_version_check check (
    odoo_synced_version is null
    or (odoo_synced_version > 0 and odoo_synced_version <= source_version)
  );

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (email);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_platform_idx on public.leads (platform);
create index if not exists leads_utm_campaign_idx on public.leads (utm_campaign);
create index if not exists leads_odoo_sync_status_idx on public.leads (odoo_sync_status);
create index if not exists leads_sync_queue_idx
  on public.leads (odoo_sync_status, source_version, created_at);
create index if not exists leads_unsynced_idx
  on public.leads (created_at)
  where odoo_synced_version is distinct from source_version;
create unique index if not exists leads_odoo_lead_id_key
  on public.leads (odoo_lead_id)
  where odoo_lead_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();

  -- Sync metadata updates do not create a new business-data version.
  new.source_version = old.source_version;
  if row(
    new.name,
    new.email,
    new.country_code,
    new.phone,
    new.phone_normalized,
    new.activity,
    new.advice,
    new.question,
    new.status,
    new.platform,
    new.source_detail,
    new.utm_source,
    new.utm_medium,
    new.utm_campaign,
    new.utm_content,
    new.utm_term,
    new.gclid,
    new.fbclid,
    new.registered_at,
    new.scheduled_at,
    new.calendar_event_id
  ) is distinct from row(
    old.name,
    old.email,
    old.country_code,
    old.phone,
    old.phone_normalized,
    old.activity,
    old.advice,
    old.question,
    old.status,
    old.platform,
    old.source_detail,
    old.utm_source,
    old.utm_medium,
    old.utm_campaign,
    old.utm_content,
    old.utm_term,
    old.gclid,
    old.fbclid,
    old.registered_at,
    old.scheduled_at,
    old.calendar_event_id
  ) then
    new.source_version = old.source_version + 1;
    new.odoo_sync_status = 'pending';
    new.odoo_sync_error = null;
  end if;

  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

-- Replace both placeholders before running this migration. Use the production
-- n8n URL; Database Webhooks do not provide durable delivery or retries.
drop trigger if exists leads_to_n8n_webhook on public.leads;
create trigger leads_to_n8n_webhook
after insert or update on public.leads
for each row
execute function supabase_functions.http_request(
  'https://n8n.sotomayorconsulting.com/webhook/REPLACE_WITH_WORKFLOW_ID',
  'POST',
  '{"Content-Type":"application/json","X-Webhook-Secret":"REPLACE_WITH_N8N_WEBHOOK_SECRET"}',
  '{}',
  '5000'
);

alter table public.leads enable row level security;

revoke all on table public.leads from anon, authenticated;
revoke all on sequence public.leads_id_seq from anon, authenticated;
grant select, insert, update on table public.leads to service_role;
grant usage, select on sequence public.leads_id_seq to service_role;

comment on table public.leads is
  'Primary system of record for marketing leads; Odoo is a downstream consumer.';
comment on column public.leads.submission_id is
  'Cross-platform idempotency key propagated to Odoo.';

commit;
