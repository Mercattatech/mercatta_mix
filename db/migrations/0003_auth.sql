-- 0003_auth.sql — Login próprio por link mágico (sem senha) e sessões.
-- Nada aqui é lido pelo navegador: só o servidor (dono do banco) mexe nestas tabelas.
-- O token em si nunca é guardado, só o hash SHA-256.

-- Link de acesso de uso único. `invite` vale mais tempo (a pessoa pode abrir o e-mail dias depois).
create table public.login_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('login', 'invite')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_tokens_user_idx on public.login_tokens(user_id, created_at desc);

-- Sessão do navegador (cookie httpOnly guarda o token; aqui fica o hash).
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text
);
create index sessions_user_idx on public.sessions(user_id);
create index sessions_expires_idx on public.sessions(expires_at);

-- Pedidos de link por IP (inclui e-mails que não existem), para frear abuso sem revelar quem tem conta.
create table public.login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index login_attempts_ip_idx on public.login_attempts(ip, created_at desc);

-- RLS ligada e sem políticas: app_user não enxerga nada daqui.
alter table public.login_tokens enable row level security;
alter table public.sessions enable row level security;
alter table public.login_attempts enable row level security;
