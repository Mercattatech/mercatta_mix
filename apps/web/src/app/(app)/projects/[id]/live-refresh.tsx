"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Mantém a tela viva: escuta mudanças em jobs/renders/vídeos do projeto (Supabase Realtime) e, enquanto há
 * trabalho em andamento, também confere a cada 4 s (rede de segurança se o Realtime cair).
 */
export function LiveRefresh({ projectId, active }: { projectId: string; active: boolean }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        router.refresh();
      }, 400);
    };
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`project-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `project_id=eq.${projectId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "renders", filter: `project_id=eq.${projectId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "source_videos", filter: `project_id=eq.${projectId}` }, refresh)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [projectId, router]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
