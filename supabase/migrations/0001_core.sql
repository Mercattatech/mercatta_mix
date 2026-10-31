-- 0001_core.sql — Identidade, multiempresa (multi-tenant) e RLS base.
-- Convenções: uuid pk, timestamptz em UTC, toda tabela de cliente tem organization_id + RLS.
-- Roda no Supabase (Postgres 15+) e no PGlite dos testes (com o stub de auth do bootstrap de teste).

-- Tabelas novas nascem SEM acesso para anon/authenticated; cada migration concede só o necessário.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ============================================================================
-- Tabelas
-- ============================================================================

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  agency_id uuid references public.agencies(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  timezone text not null default 'America/Sao_Paulo',
  approval_required boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_agency_idx on public.organizations(agency_id);

-- Perfil público do usuário (espelha auth.users).
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  phone text,
  locale text not null default 'pt-BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'aprovador')),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index memberships_org_idx on public.memberships(organization_id);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Piloto só por convite: o token em si nunca é guardado, só o hash.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner', 'editor', 'aprovador')),
  token_hash text not null unique,
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on public.invitations(organization_id);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  document text not null check (document in ('terms', 'privacy', 'dpa')),
  version text not null,
  accepted_at timestamptz not null default now(),
  ip inet
);
create index consent_user_idx on public.consent_records(user_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  diff jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_org_idx on public.audit_logs(organization_id, created_at desc);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Funções de permissão (usadas por TODAS as políticas RLS)
-- SECURITY DEFINER + search_path fixo: leem memberships sem cair em recursão de RLS.
-- ============================================================================

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create function public.is_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where organization_id = org and user_id = auth.uid());
$$;

create function public.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org and user_id = auth.uid() and role = any(roles)
  );
$$;

-- Dono da agência-mãe da empresa (white-label; ativado de fato na Fase 7).
create function public.is_agency_manager(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organizations o
    join public.agencies a on a.id = o.agency_id
    where o.id = org and a.owner_user_id = auth.uid() and a.status = 'active'
  );
$$;

-- Pode ler os dados da empresa.
create function public.can_read_org(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(org) or public.is_agency_manager(org) or public.is_platform_admin();
$$;

-- Pode criar/editar (papéis owner e editor; agência-mãe e admin também).
create function public.can_write_org(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(org, array['owner', 'editor'])
      or public.is_agency_manager(org)
      or public.is_platform_admin();
$$;

-- Pode gerenciar a equipe e as configurações da empresa.
create function public.can_admin_org(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(org, array['owner']) or public.is_agency_manager(org) or public.is_platform_admin();
$$;

revoke all on function public.is_platform_admin(), public.is_member(uuid), public.has_role(uuid, text[]),
  public.is_agency_manager(uuid), public.can_read_org(uuid), public.can_write_org(uuid), public.can_admin_org(uuid) from public;
grant execute on function public.is_platform_admin(), public.is_member(uuid), public.has_role(uuid, text[]),
  public.is_agency_manager(uuid), public.can_read_org(uuid), public.can_write_org(uuid), public.can_admin_org(uuid)
  to authenticated, service_role;

-- ============================================================================
-- Gatilhos
-- ============================================================================

create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agencies_updated before update on public.agencies for each row execute function public.set_updated_at();
create trigger organizations_updated before update on public.organizations for each row execute function public.set_updated_at();
create trigger users_updated before update on public.users for each row execute function public.set_updated_at();

-- Empresa cliente: no máximo 3 usuários.
create function public.enforce_member_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('members:' || new.organization_id::text));
  if (select count(*) from public.memberships where organization_id = new.organization_id) >= 3 then
    raise exception 'member_limit_reached' using errcode = 'P0001', hint = 'Cada empresa pode ter no máximo 3 usuários.';
  end if;
  return new;
end;
$$;
create trigger memberships_limit before insert on public.memberships for each row execute function public.enforce_member_limit();

-- Não deixa a empresa ficar sem nenhum owner.
create function public.keep_one_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (
      select 1 from public.memberships
      where organization_id = old.organization_id and role = 'owner' and id <> old.id
    ) and exists (select 1 from public.organizations where id = old.organization_id) then
      raise exception 'last_owner' using errcode = 'P0001', hint = 'A empresa precisa de pelo menos um owner.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger memberships_keep_owner before update or delete on public.memberships for each row execute function public.keep_one_owner();

-- Espelha auth.users em public.users.
create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.agencies enable row level security;
alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.invitations enable row level security;
alter table public.consent_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;

-- agencies
create policy agencies_select on public.agencies for select to authenticated
  using (owner_user_id = auth.uid() or public.is_platform_admin());

-- organizations (criação/exclusão: só pelo servidor com service_role)
create policy organizations_select on public.organizations for select to authenticated
  using (public.can_read_org(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.can_admin_org(id)) with check (public.can_admin_org(id));

-- users: o próprio perfil, quem divide empresa com você, e o admin
create policy users_select on public.users for select to authenticated
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid() and theirs.user_id = public.users.id
    )
  );
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships: a equipe vê a equipe; owner gerencia (inserir/remover); ninguém muda o próprio papel
create policy memberships_select on public.memberships for select to authenticated
  using (public.can_read_org(organization_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.can_admin_org(organization_id));
create policy memberships_update on public.memberships for update to authenticated
  using (public.can_admin_org(organization_id) and user_id <> auth.uid())
  with check (public.can_admin_org(organization_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.can_admin_org(organization_id) or user_id = auth.uid());

-- platform_admins: ninguém lê pelo cliente (só service_role, que ignora RLS)
-- (sem políticas = sem acesso)

-- invitations
create policy invitations_select on public.invitations for select to authenticated
  using (public.can_admin_org(organization_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.can_admin_org(organization_id));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.can_admin_org(organization_id));

-- consent_records: o usuário vê e registra o próprio aceite
create policy consent_select on public.consent_records for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy consent_insert on public.consent_records for insert to authenticated
  with check (user_id = auth.uid());

-- audit_logs: leitura por owner/admin; escrita só pelo servidor
create policy audit_select on public.audit_logs for select to authenticated
  using (organization_id is not null and public.can_admin_org(organization_id) or public.is_platform_admin());

-- platform_settings: leitura para logados; escrita só pelo servidor/admin
create policy settings_select on public.platform_settings for select to authenticated using (true);
create policy settings_admin_write on public.platform_settings for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ============================================================================
-- Privilégios de tabela (RLS decide as LINHAS; GRANT decide as OPERAÇÕES)
-- ============================================================================

revoke all on all tables in schema public from anon, authenticated;
grant select on public.agencies, public.organizations, public.users, public.memberships,
  public.invitations, public.consent_records, public.audit_logs, public.platform_settings to authenticated;
grant update (name, timezone, approval_required, settings) on public.organizations to authenticated;
grant update (name, phone, locale) on public.users to authenticated;
grant insert, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
grant insert, delete on public.invitations to authenticated;
grant insert on public.consent_records to authenticated;
grant insert, update, delete on public.platform_settings to authenticated;

insert into public.platform_settings (key, value) values
  ('transcription', '{"provider": "faster-whisper", "model": "small", "fallback": "openai-whisper-1"}'),
  ('upload_limits', '{"max_bytes": 5368709120, "max_duration_ms": 180000, "extensions": ["mp4", "mov", "mkv"]}'),
  -- Valores iniciais. Redes sem valor aqui usam "default". Confirmar nas documentações oficiais (Fases 3 e 4).
  ('network_duration_limits_ms', '{"default": 60000, "instagram": 90000, "youtube_shorts": 179000}'),
  ('credit_costs', '{"per_render": 1}'),
  ('storage_retention_days', '{"renders": 30, "sources": 90}');
