begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_n8n_lead()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  perform net.http_post(
    url := 'https://n8n.sotomayorconsulting.com/webhook/REPLACE_WITH_WORKFLOW_ID',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', 'REPLACE_WITH_N8N_WEBHOOK_SECRET'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', case
        when TG_OP = 'UPDATE' then to_jsonb(OLD)
        else null
      end
    ),
    timeout_milliseconds := 5000
  );

  return NEW;
end;
$$;

revoke all on function public.notify_n8n_lead() from public;

drop trigger if exists leads_to_n8n_insert on public.leads;
create trigger leads_to_n8n_insert
after insert on public.leads
for each row execute function public.notify_n8n_lead();

drop trigger if exists leads_to_n8n_update on public.leads;
create trigger leads_to_n8n_update
after update on public.leads
for each row
when (old.source_version is distinct from new.source_version)
execute function public.notify_n8n_lead();

commit;
