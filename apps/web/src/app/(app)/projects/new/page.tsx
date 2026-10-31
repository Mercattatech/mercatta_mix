import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getAppContext } from "@/lib/context";
import { NewProjectForm } from "./new-project-form";

export const metadata: Metadata = { title: "Novo projeto" };

export default async function NewProjectPage() {
  const ctx = await getAppContext();
  if (!ctx.organization || ctx.organization.role === "aprovador") redirect("/projects");
  return (
    <div className="animate-in mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Novo projeto</h1>
        <p className="mt-1 text-muted">Depois você envia os vídeos: ganchos, miolos e chamadas.</p>
      </div>
      <Card className="p-6">
        <NewProjectForm organizationId={ctx.organization.id} />
      </Card>
    </div>
  );
}
