-- 0007_instagram_automations.sql
-- Motor de automação estilo ManyChat para Instagram:
-- Gatilhos (Comentário em Reels/Post, Direct, Story), Resposta Pública Rotativa no Comentário,
-- Trava de Seguidor ("Só entregar se seguir" via is_user_follow_business), Captura de Lead (WhatsApp/E-mail)
-- e Entrega de Link/CTA no Direct, além de CRM de Interações.

create table if not exists public.instagram_automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instagram_account_id uuid not null,
  project_id uuid,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'paused')),

  -- Gatilho (Trigger)
  trigger_type text not null default 'comment' check (trigger_type in ('comment', 'dm', 'story_reply', 'any')),
  media_scope text not null default 'all_media' check (media_scope in ('all_media', 'specific_media', 'project_media')),
  target_media_ids text[] not null default '{}',
  match_mode text not null default 'contains' check (match_mode in ('contains', 'exact', 'any_comment')),
  keywords text[] not null default '{}',

  -- Passo 1: Resposta pública automática no comentário
  reply_to_comment boolean not null default true,
  comment_replies text[] not null default '{}',

  -- Passo 2: Trava de Seguidor ("Follow Gate" — só entrega se seguir o perfil)
  require_follow boolean not null default true,
  follow_gate_message text not null default '',
  follow_gate_button_label text not null default '✅ Já sigo! Liberar acesso',
  not_following_message text not null default '',

  -- Passo 3: Captura opcional de Lead (WhatsApp / E-mail no Direct antes da entrega)
  collect_lead_field text not null default 'none' check (collect_lead_field in ('none', 'email', 'whatsapp')),
  collect_lead_prompt text not null default '',

  -- Passo 4: Entrega Final no Direct (DM + Botão com Link)
  dm_message text not null default '',
  dm_button_title text not null default 'Acessar Agora 🚀',
  dm_button_url text not null default '',

  -- Métricas acumuladas
  triggers_count int not null default 0,
  comment_replies_count int not null default 0,
  dms_sent_count int not null default 0,
  followers_gained_count int not null default 0,
  leads_captured_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (instagram_account_id, organization_id) references public.instagram_accounts(id, organization_id) on delete cascade,
  unique (id, organization_id)
);

create index if not exists instagram_automations_org_idx on public.instagram_automations(organization_id, status);
create index if not exists instagram_automations_acc_idx on public.instagram_automations(instagram_account_id, status);
create trigger instagram_automations_updated before update on public.instagram_automations for each row execute function public.set_updated_at();

create table if not exists public.instagram_automation_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_id uuid not null,
  instagram_account_id uuid not null,
  ig_sender_id text not null,
  ig_username text,
  ig_name text,
  source_type text not null default 'comment' check (source_type in ('comment', 'dm', 'story_reply', 'simulation')),
  external_event_id text,
  trigger_text text,
  is_following boolean not null default false,
  stage text not null default 'awaiting_follow' check (stage in ('triggered', 'awaiting_follow', 'awaiting_lead_input', 'delivered', 'failed')),
  lead_email text,
  lead_whatsapp text,
  comment_reply_sent text,
  dm_sent text,
  error_pt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (automation_id, organization_id) references public.instagram_automations(id, organization_id) on delete cascade,
  foreign key (instagram_account_id, organization_id) references public.instagram_accounts(id, organization_id) on delete cascade,
  unique (id, organization_id)
);

create unique index if not exists instagram_automation_sessions_event_uq
  on public.instagram_automation_sessions(organization_id, external_event_id)
  where external_event_id is not null;

create index if not exists instagram_automation_sessions_org_idx
  on public.instagram_automation_sessions(organization_id, created_at desc);

create index if not exists instagram_automation_sessions_sender_idx
  on public.instagram_automation_sessions(instagram_account_id, ig_sender_id, updated_at desc);

create trigger instagram_automation_sessions_updated before update on public.instagram_automation_sessions for each row execute function public.set_updated_at();

alter table public.instagram_automations enable row level security;
alter table public.instagram_automation_sessions enable row level security;

create policy instagram_automations_select on public.instagram_automations for select to app_user
  using (public.can_read_org(organization_id));
create policy instagram_automations_write on public.instagram_automations for all to app_user
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

create policy instagram_automation_sessions_select on public.instagram_automation_sessions for select to app_user
  using (public.can_read_org(organization_id));
create policy instagram_automation_sessions_write on public.instagram_automation_sessions for all to app_user
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

grant select, insert, update, delete on public.instagram_automations, public.instagram_automation_sessions to app_user;
