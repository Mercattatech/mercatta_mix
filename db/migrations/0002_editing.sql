-- 0002_editing.sql — Núcleo do Combinador (Fase 1): projetos, vídeos, transcrições, trechos,
-- combinações, renders, jobs, créditos e uso.
--
-- Integridade entre empresas no PRÓPRIO banco: todo filho aponta para o pai com (id, organization_id),
-- então é impossível (mesmo com bug no app) ligar dados de uma empresa a dados de outra.

-- ============================================================================
-- Tabelas
-- ============================================================================

create table public.caption_styles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade, -- null = estilo da plataforma
  name text not null check (length(trim(name)) > 0),
  config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index caption_styles_org_idx on public.caption_styles(organization_id);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('source', 'preprocessed', 'render', 'cover', 'logo', 'zip')),
  r2_key text not null unique,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  mime text,
  sha256 text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  -- a chave no storage sempre começa com org/{organization_id}/
  check (r2_key like 'org/' || organization_id::text || '/%')
);
create index media_assets_org_idx on public.media_assets(organization_id, kind);
create index media_assets_expiry_idx on public.media_assets(expires_at) where deleted_at is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'combiner' check (kind in ('combiner', 'long_cut')),
  status text not null default 'draft' check (status in ('draft', 'processing', 'ready', 'rendering', 'done', 'archived')),
  caption_style_id uuid references public.caption_styles(id) on delete set null,
  target_networks text[] not null default '{}',
  max_duration_ms integer check (max_duration_ms is null or max_duration_ms > 0),
  expires_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index projects_org_idx on public.projects(organization_id, created_at desc);
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();

create table public.source_videos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  type text not null check (type in ('hook', 'body', 'cta', 'extra')),
  label text,
  original_filename text,
  asset_id uuid,
  preprocessed_asset_id uuid,
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  width integer,
  height integer,
  fps numeric(6, 3),
  status text not null default 'uploading' check (status in ('uploading', 'uploaded', 'processing', 'ready', 'failed')),
  error_pt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (asset_id, organization_id) references public.media_assets(id, organization_id),
  foreign key (preprocessed_asset_id, organization_id) references public.media_assets(id, organization_id),
  unique (id, organization_id),
  unique (id, organization_id, type)
);
create index source_videos_project_idx on public.source_videos(project_id, type, sort_order);

-- Transcrição com tempo por palavra. Cache por arquivo: nunca transcrever o mesmo arquivo duas vezes.
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_video_id uuid not null,
  sha256 text not null,
  language text not null,
  provider text not null,
  model text not null,
  words jsonb not null check (jsonb_typeof(words) = 'array'),
  full_text text not null default '',
  created_at timestamptz not null default now(),
  foreign key (source_video_id, organization_id) references public.source_videos(id, organization_id) on delete cascade,
  unique (source_video_id)
);
-- chave do cache (não é única: dois vídeos com o mesmo arquivo na mesma empresa reaproveitam a mesma transcrição)
-- busca de cache entre empresas é feita só pelo servidor (dono do banco), copiando a linha para a empresa de destino
create index transcripts_cache_idx on public.transcripts(sha256, language, provider, model);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  source_video_id uuid not null,
  type text not null check (type in ('hook', 'body', 'cta', 'extra')),
  start_word_idx integer not null check (start_word_idx >= 0),
  end_word_idx integer not null,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (end_word_idx >= start_word_idx),
  check (end_ms > start_ms),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  -- o tipo do trecho precisa ser o tipo do vídeo de origem
  foreign key (source_video_id, organization_id, type) references public.source_videos(id, organization_id, type) on delete cascade,
  unique (id, organization_id),
  unique (id, organization_id, type)
);
create index segments_project_idx on public.segments(project_id, type, sort_order);

create table public.combinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  hook_segment_id uuid not null,
  body_segment_id uuid not null,
  cta_segment_id uuid not null,
  extra_segment_id uuid,
  -- colunas geradas fixam o tipo esperado em cada chave estrangeira (gancho só aponta para gancho etc.)
  hook_kind text generated always as ('hook') stored,
  body_kind text generated always as ('body') stored,
  cta_kind text generated always as ('cta') stored,
  extra_kind text generated always as ('extra') stored,
  code text not null check (code ~ '^[A-Za-z0-9_-]+$'),
  -- ordem dos trechos no vídeo final (o tipo extra pode entrar em posições diferentes)
  sequence text[] not null default array['hook', 'body', 'cta'] check (sequence <@ array['hook', 'body', 'cta', 'extra'] and cardinality(sequence) between 3 and 4),
  style_key text,
  total_duration_ms integer not null check (total_duration_ms > 0),
  plan_hash text not null,
  selected boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (hook_segment_id, organization_id, hook_kind) references public.segments(id, organization_id, type) on delete cascade,
  foreign key (body_segment_id, organization_id, body_kind) references public.segments(id, organization_id, type) on delete cascade,
  foreign key (cta_segment_id, organization_id, cta_kind) references public.segments(id, organization_id, type) on delete cascade,
  foreign key (extra_segment_id, organization_id, extra_kind) references public.segments(id, organization_id, type) on delete cascade,
  unique (project_id, code),
  unique (id, organization_id)
);
create index combinations_project_idx on public.combinations(project_id);

create table public.renders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  combination_id uuid not null,
  plan_hash text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  asset_id uuid,
  duration_ms integer,
  width integer,
  height integer,
  fps numeric(6, 3),
  size_bytes bigint,
  error_pt text,
  -- linha do tempo (cortes em quadros) e legenda ASS usados: permite auditar e refazer o mesmo vídeo
  meta jsonb not null default '{}'::jsonb,
  cost_cents numeric(12, 4) not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (combination_id, organization_id) references public.combinations(id, organization_id) on delete cascade,
  foreign key (asset_id, organization_id) references public.media_assets(id, organization_id),
  -- mesmo plano = mesmo vídeo: um render por (combinação, plano)
  unique (combination_id, plan_hash),
  unique (id, organization_id)
);
create index renders_project_idx on public.renders(project_id, status);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null check (kind in ('upload_process', 'transcribe', 'plan', 'render', 'zip', 'publish', 'cleanup')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  step_label text,
  idempotency_key text not null,
  attempts integer not null default 0,
  error_pt text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  priority integer not null default 0,
  boss_job_id text,
  ref_type text,
  ref_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index jobs_org_status_idx on public.jobs(organization_id, status, created_at desc);
create index jobs_project_idx on public.jobs(project_id);
create trigger jobs_updated before update on public.jobs for each row execute function public.set_updated_at();

create table public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('ai', 'render', 'storage', 'transcribe')),
  qty numeric(14, 4) not null default 1,
  cost_cents numeric(12, 4) not null default 0,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index usage_events_org_idx on public.usage_events(organization_id, created_at desc);

-- Livro de créditos: só recebe inserções. Saldo = soma de delta.
--   grant/purchase: +n | reserve: -n (separa o crédito) | commit: 0 (consumo confirmado) | release: +n (devolve a reserva)
create table public.credits_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('grant', 'purchase', 'reserve', 'commit', 'release', 'adjustment')),
  ref_type text,
  ref_id uuid,
  note text,
  created_at timestamptz not null default now(),
  check ((reason = 'reserve' and delta < 0) or (reason in ('grant', 'purchase', 'release') and delta > 0) or reason = 'adjustment' or (reason = 'commit' and delta = 0))
);
create index credits_org_idx on public.credits_ledger(organization_id, created_at desc);
-- a reserva "ativa" de uma referência é a última reserva sem commit/release depois dela (veja as funções abaixo)
create index credits_ref_idx on public.credits_ledger(organization_id, ref_type, ref_id) where ref_id is not null;

-- O livro nunca é alterado nem apagado diretamente. Exceção: a exclusão da empresa (LGPD, direito ao
-- apagamento) remove as linhas em cascata; nesse caso o gatilho roda aninhado (pg_trigger_depth() > 1).
create function public.credits_ledger_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'credits_ledger é somente de inserção';
end;
$$;
create trigger credits_ledger_no_update before update or delete on public.credits_ledger
  for each row execute function public.credits_ledger_immutable();

-- ============================================================================
-- Funções de créditos (somente servidor, que conecta como dono do banco)
-- ============================================================================

create function public.credit_balance(org uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::bigint from public.credits_ledger where organization_id = org;
$$;

-- Saldo para a interface: exige acesso à empresa.
create function public.my_credit_balance(org uuid) returns bigint
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_read_org(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.credit_balance(org);
end;
$$;

-- Reserva ativa de uma referência: a última reserva que ainda não teve commit/release depois dela.
create function public._credit_active_reserve(org uuid, p_ref_type text, p_ref_id uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select r.id from public.credits_ledger r
   where r.organization_id = org and r.reason = 'reserve' and r.ref_type = p_ref_type and r.ref_id = p_ref_id
     and not exists (
       select 1 from public.credits_ledger e
        where e.organization_id = org and e.reason in ('commit', 'release')
          and e.ref_type = p_ref_type and e.ref_id = p_ref_id and e.id > r.id)
   order by r.id desc limit 1;
$$;

-- Idempotente: reservar duas vezes a mesma referência cobra uma vez. Depois de um release (falha), pode reservar de novo.
create function public.reserve_credits(org uuid, amount integer, p_ref_type text, p_ref_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if amount <= 0 then raise exception 'invalid_amount'; end if;
  perform pg_advisory_xact_lock(hashtext('credits:' || org::text));
  if public._credit_active_reserve(org, p_ref_type, p_ref_id) is not null then
    return;
  end if;
  if public.credit_balance(org) < amount then
    raise exception 'insufficient_credits' using errcode = 'P0001', hint = 'Créditos insuficientes.';
  end if;
  insert into public.credits_ledger (organization_id, delta, reason, ref_type, ref_id)
  values (org, -amount, 'reserve', p_ref_type, p_ref_id);
end;
$$;

create function public.commit_credits(org uuid, p_ref_type text, p_ref_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('credits:' || org::text));
  if public._credit_active_reserve(org, p_ref_type, p_ref_id) is null then
    -- já confirmado antes? então é repetição inofensiva
    if exists (select 1 from public.credits_ledger where organization_id = org and reason = 'commit' and ref_type = p_ref_type and ref_id = p_ref_id) then
      return;
    end if;
    raise exception 'no_reservation';
  end if;
  insert into public.credits_ledger (organization_id, delta, reason, ref_type, ref_id)
  values (org, 0, 'commit', p_ref_type, p_ref_id);
end;
$$;

create function public.release_credits(org uuid, p_ref_type text, p_ref_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  active bigint;
  held integer;
begin
  perform pg_advisory_xact_lock(hashtext('credits:' || org::text));
  active := public._credit_active_reserve(org, p_ref_type, p_ref_id);
  if active is null then return; end if; -- nada reservado (ou já finalizado)
  select -delta into held from public.credits_ledger where id = active;
  insert into public.credits_ledger (organization_id, delta, reason, ref_type, ref_id)
  values (org, held, 'release', p_ref_type, p_ref_id);
end;
$$;

revoke all on function public.credit_balance(uuid), public.my_credit_balance(uuid), public._credit_active_reserve(uuid, text, uuid),
  public.reserve_credits(uuid, integer, text, uuid), public.commit_credits(uuid, text, uuid), public.release_credits(uuid, text, uuid) from public;
grant execute on function public.my_credit_balance(uuid) to app_user;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.caption_styles enable row level security;
alter table public.media_assets enable row level security;
alter table public.projects enable row level security;
alter table public.source_videos enable row level security;
alter table public.transcripts enable row level security;
alter table public.segments enable row level security;
alter table public.combinations enable row level security;
alter table public.renders enable row level security;
alter table public.jobs enable row level security;
alter table public.usage_events enable row level security;
alter table public.credits_ledger enable row level security;

-- caption_styles: estilos da plataforma (organization_id null) são de todos; os da empresa, só dela
create policy caption_styles_select on public.caption_styles for select to app_user
  using (organization_id is null or public.can_read_org(organization_id));
create policy caption_styles_insert on public.caption_styles for insert to app_user
  with check (organization_id is not null and public.can_write_org(organization_id));
create policy caption_styles_update on public.caption_styles for update to app_user
  using (organization_id is not null and public.can_write_org(organization_id))
  with check (organization_id is not null and public.can_write_org(organization_id));
create policy caption_styles_delete on public.caption_styles for delete to app_user
  using (organization_id is not null and public.can_write_org(organization_id));

-- leitura por empresa (escritas desses dados passam pelo servidor)
create policy media_assets_select on public.media_assets for select to app_user using (public.can_read_org(organization_id));
create policy transcripts_select on public.transcripts for select to app_user using (public.can_read_org(organization_id));
create policy renders_select on public.renders for select to app_user using (public.can_read_org(organization_id));
create policy jobs_select on public.jobs for select to app_user using (public.can_read_org(organization_id));
create policy credits_select on public.credits_ledger for select to app_user using (public.can_read_org(organization_id));
-- custo interno por cliente (margem da Mercatta): só o admin da plataforma
create policy usage_events_select on public.usage_events for select to app_user using (public.is_platform_admin());

-- projects
create policy projects_select on public.projects for select to app_user using (public.can_read_org(organization_id));
create policy projects_insert on public.projects for insert to app_user
  with check (public.can_write_org(organization_id) and created_by = public.current_user_id());
create policy projects_update on public.projects for update to app_user
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));
create policy projects_delete on public.projects for delete to app_user using (public.can_write_org(organization_id));

-- source_videos: criar passa pelo servidor (precisa criar o asset); editor renomeia/ordena/remove
create policy source_videos_select on public.source_videos for select to app_user using (public.can_read_org(organization_id));
create policy source_videos_update on public.source_videos for update to app_user
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));
create policy source_videos_delete on public.source_videos for delete to app_user using (public.can_write_org(organization_id));

-- segments: o editor de trechos escreve direto
create policy segments_select on public.segments for select to app_user using (public.can_read_org(organization_id));
create policy segments_insert on public.segments for insert to app_user with check (public.can_write_org(organization_id));
create policy segments_update on public.segments for update to app_user
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));
create policy segments_delete on public.segments for delete to app_user using (public.can_write_org(organization_id));

-- combinations: geradas pelo servidor; o editor só liga/desliga (selected)
create policy combinations_select on public.combinations for select to app_user using (public.can_read_org(organization_id));
create policy combinations_update on public.combinations for update to app_user
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

-- ============================================================================
-- Privilégios de tabela
-- ============================================================================

grant select on public.caption_styles, public.media_assets, public.projects, public.source_videos, public.transcripts,
  public.segments, public.combinations, public.renders, public.jobs, public.usage_events, public.credits_ledger to app_user;
grant insert, update, delete on public.caption_styles to app_user;
grant insert, delete on public.projects to app_user;
grant update (name, status, caption_style_id, target_networks, max_duration_ms, expires_at) on public.projects to app_user;
grant update (label, sort_order) on public.source_videos to app_user;
grant delete on public.source_videos to app_user;
grant insert, delete on public.segments to app_user;
grant update (label, sort_order, start_word_idx, end_word_idx, start_ms, end_ms) on public.segments to app_user;
grant update (selected) on public.combinations to app_user;

-- Estilo de legenda padrão da plataforma (karaokê: branco com destaque amarelo, caixa alta, embaixo)
insert into public.caption_styles (organization_id, name, config, is_default) values
  (null, 'Karaokê amarelo', '{"mode":"karaoke","uppercase":true,"position":"bottom","primaryColor":"#FFFFFF","highlightColor":"#FFD400","outlineColor":"#000000"}', true);
