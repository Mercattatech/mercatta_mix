-- 0006_instagram_scheduling.sql
-- Contas do Instagram Graph API e agendamento em massa de publicações (Reels, Post e Carrossel).

create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  username text,
  ig_user_id text not null check (length(trim(ig_user_id)) > 0),
  access_token_enc text not null,
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, ig_user_id),
  unique (id, organization_id)
);

create index if not exists instagram_accounts_org_idx on public.instagram_accounts(organization_id);
create trigger instagram_accounts_updated before update on public.instagram_accounts for each row execute function public.set_updated_at();

create table if not exists public.social_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  instagram_account_id uuid not null,
  format text not null default 'REELS' check (format in ('REELS', 'POST', 'CAROUSEL')),
  render_ids uuid[] not null check (cardinality(render_ids) >= 1),
  codes text[] not null default '{}',
  caption text not null default '',
  share_to_feed boolean not null default true,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'publishing', 'published', 'failed', 'canceled')),
  ig_container_id text,
  ig_media_id text,
  permalink text,
  error_pt text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (instagram_account_id, organization_id) references public.instagram_accounts(id, organization_id) on delete cascade,
  unique (id, organization_id)
);

create index if not exists social_schedules_project_idx on public.social_schedules(project_id, scheduled_at asc);
create index if not exists social_schedules_org_idx on public.social_schedules(organization_id, scheduled_at asc);
create trigger social_schedules_updated before update on public.social_schedules for each row execute function public.set_updated_at();

alter table public.instagram_accounts enable row level security;
alter table public.social_schedules enable row level security;

create policy instagram_accounts_select on public.instagram_accounts for select to app_user
  using (public.can_read_org(organization_id));
create policy instagram_accounts_write on public.instagram_accounts for all to app_user
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

create policy social_schedules_select on public.social_schedules for select to app_user
  using (public.can_read_org(organization_id));
create policy social_schedules_write on public.social_schedules for all to app_user
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

grant select, insert, update, delete on public.instagram_accounts, public.social_schedules to app_user;

