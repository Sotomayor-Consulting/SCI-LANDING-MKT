begin;

alter table public.leads
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check check (
    status in (
      'new',
      'contacted',
      'qualified',
      'scheduled',
      'won',
      'lost',
      'spam',
      'rejected'
    )
  );

comment on column public.leads.status is
  'Commercial lead status, including rejected submissions that must remain auditable.';

commit;
