"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente do navegador (usa a sessão em cookie e só a chave pública). */
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
