import "server-only";
import { cache } from "react";
import { isPlatformAdmin, requireUser, supabaseForUser, type SessionUser } from "./auth";

export interface AppContext {
  user: SessionUser;
  isAdmin: boolean;
  organization: { id: string; name: string; role: string } | null;
  credits: number | null;
}

/** Quem é o usuário, qual empresa está ativa e quantos créditos ela tem. Uma consulta por requisição. */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const user = await requireUser();
  const supabase = await supabaseForUser();
  const { data } = await supabase.from("memberships").select("role, organization:organizations(id, name)").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1);
  const row = data?.[0] as { role: string; organization: { id: string; name: string } | { id: string; name: string }[] | null } | undefined;
  const org = row ? (Array.isArray(row.organization) ? row.organization[0] : row.organization) : null;
  const organization = org && row ? { id: org.id, name: org.name, role: row.role } : null;

  let credits: number | null = null;
  if (organization) {
    const { data: bal } = await supabase.rpc("my_credit_balance", { org: organization.id });
    credits = bal === null || bal === undefined ? null : Number(bal);
  }
  return { user, isAdmin: await isPlatformAdmin(user.id), organization, credits };
});
