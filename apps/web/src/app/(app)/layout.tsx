import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui";
import { getAppContext } from "@/lib/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:px-6">
          <Link href="/projects" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/15 text-xs font-bold text-primary-2">
              M
            </span>
            <span className="font-display text-sm font-semibold tracking-tight text-fg">
              Mercatta Mix
            </span>
          </Link>

          <div className="hidden h-4 w-px bg-border sm:block" />

          <nav aria-label="Principal" className="hidden items-center gap-1 sm:flex">
            <NavLink href="/projects">Projetos</NavLink>
            <NavLink href="/instagram">Instagram</NavLink>
            <NavLink href="/automations">Automações Mix</NavLink>
            <NavLink href="/team">Equipe</NavLink>
            {ctx.isAdmin && <NavLink href="/admin">Admin</NavLink>}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {ctx.organization && (
              <div className="hidden text-right leading-tight sm:block">
                <p className="max-w-[14rem] truncate text-xs font-medium text-fg">
                  {ctx.organization.name}
                </p>
                <p className="font-mono text-[11px] text-muted">{ctx.user.email}</p>
              </div>
            )}
            {ctx.credits !== null && (
              <Badge tone="primary" title="Créditos operacionais disponíveis" id="credits-chip">
                <span className="font-mono">{ctx.credits}</span>{" "}
                {ctx.credits === 1 ? "crédito" : "créditos"}
              </Badge>
            )}
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
        <nav
          aria-label="Principal (celular)"
          className="flex gap-1 overflow-x-auto border-t border-border px-4 py-1.5 sm:hidden"
        >
          <NavLink href="/projects">Projetos</NavLink>
          <NavLink href="/instagram">Instagram</NavLink>
          <NavLink href="/automations">Automações Mix</NavLink>
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
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
    >
      {children}
    </Link>
  );
}
