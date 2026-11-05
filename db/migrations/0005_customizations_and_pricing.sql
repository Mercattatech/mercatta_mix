-- 0005_customizations_and_pricing.sql
-- Suporte a instruções de edição, B-rolls e configurações de legenda por projeto,
-- além de tabela/chave para precificação de pacotes e vídeos individuais.

alter table public.projects
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists editing_instructions text;

insert into public.platform_settings (key, value)
values (
  'pricing_packages',
  '{
    "per_video_credits": 1,
    "package_small": { "name": "Pacote Pequeno", "discount_percent": 0 },
    "package_medium": { "name": "Pacote Médio", "discount_percent": 10 },
    "package_total": { "name": "Pacote Total", "discount_percent": 20 }
  }'::jsonb
)
on conflict (key) do nothing;

