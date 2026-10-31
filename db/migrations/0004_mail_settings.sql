-- 0004_mail_settings.sql — Configuração de SMTP editável pelo dono da plataforma (painel Admin → E-mail).
-- Uma única linha (singleton). A senha NUNCA fica em texto puro: é cifrada pelo servidor (AES-256-GCM)
-- com a chave SETTINGS_ENCRYPTION_KEY, que fica só no ambiente (não no banco).

create table public.mail_settings (
  id boolean primary key default true check (id),
  provider text not null default 'custom',
  host text not null check (length(host) between 1 and 253),
  port integer not null check (port between 1 and 65535),
  security text not null check (security in ('starttls', 'ssl')),
  username text not null check (length(username) between 1 and 320),
  password_enc text not null,
  from_name text not null default 'Mercatta Mix' check (length(from_name) <= 120),
  from_email text not null check (length(from_email) between 3 and 320),
  reply_to text check (reply_to is null or length(reply_to) <= 320),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text
);

-- RLS ligada e sem políticas: só o servidor (dono do banco) lê e grava; app_user não enxerga nada.
alter table public.mail_settings enable row level security;
