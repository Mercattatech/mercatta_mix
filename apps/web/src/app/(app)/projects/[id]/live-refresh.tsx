"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Mantém a tela viva: enquanto há trabalho em andamento (processando vídeo, gerando, montando ZIP),
 * confere o servidor a cada 3 s e atualiza a página sem piscar. Parado, não consulta nada.
 */
export function LiveRefresh({ active }: { projectId?: string; active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh(); // aba escondida não gasta servidor
    }, 3000);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
