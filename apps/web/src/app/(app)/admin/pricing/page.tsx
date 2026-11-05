import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPricingConfig } from "@mercatta/server";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";
import { PricingForm } from "./pricing-form";

export const metadata: Metadata = { title: "Precificação e Pacotes" };

export default async function PricingPage() {
  const ctx = await getAppContext();
  if (!ctx.isAdmin) notFound();

  const pricing = await getPricingConfig(getDb());

  return (
    <div className="animate-in mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-fg">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Precificação de Pacotes e Vídeos</h1>
        <p className="mt-1 text-muted">
          Defina o custo em créditos por vídeo individual e a política de precificação/descontos para os Pacotes Pequeno, Médio e Total.
        </p>
      </div>

      <PricingForm initial={pricing} />
    </div>
  );
}

