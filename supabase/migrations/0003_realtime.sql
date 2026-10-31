-- 0003_realtime.sql — Progresso em tempo real: jobs, renders e vídeos de origem entram na publicação do Realtime.
-- A RLS (can_read_org) continua valendo: cada cliente só recebe eventos da própria empresa.
-- Guardado para rodar também fora do Supabase (testes locais).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs;
    alter publication supabase_realtime add table public.renders;
    alter publication supabase_realtime add table public.source_videos;
  end if;
end
$$;
