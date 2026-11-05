import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui";
import { getAppContext } from "@/lib/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/projects" className="font-display text-xl font-semibold tracking-tight">
            <span className="gradient-text">Mercatta Mix</span>
          </Link>
          <nav aria-label="Principal" className="ml-2 hidden items-center gap-1 sm:flex">
            <NavLink href="/projects">Projetos</NavLink>
            <NavLink href="/team">Equipe</NavLink>
            {ctx.isAdmin && <NavLink href="/admin">Admin</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {ctx.organization && (
              <div className="hidden text-right leading-tight sm:block">
                <p className="max-w-[14rem] truncate text-sm font-medium">{ctx.organization.name}</p>
                <p className="text-xs text-muted">{ctx.user.email}</p>
              </div>
            )}
            {ctx.credits !== null && (
              <Badge tone="primary" title="Créditos disponíveis" id="credits-chip">
                ✦ {ctx.credits} {ctx.credits === 1 ? "crédito" : "créditos"}
              </Badge>
            )}
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
        <nav aria-label="Principal (celular)" className="flex gap-1 overflow-x-auto border-t border-border px-4 py-1.5 sm:hidden">
          <NavLink href="/projects">Projetos</NavLink>
          <NavLink href="/team">Equipe</NavLink>
          {ctx.isAdmin && <NavLink href="/admin">Admin</NavLink>}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
      {children}
    </Link>
  );
}
