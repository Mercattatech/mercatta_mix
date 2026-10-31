import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, UserFacingError } from "@mercatta/server";
import { ApiError } from "./auth";

/** Envolve uma rota: converte erros conhecidos em respostas HTTP com mensagem em português. */
export async function handle(fn: () => Promise<Response | object>): Promise<Response> {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof UserFacingError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof ZodError) return NextResponse.json({ error: "Dados inválidos. Confira os campos e tente de novo." }, { status: 400 });
    const msg = e instanceof Error ? e.message : String(e);
    if (/insufficient_credits/.test(msg)) return NextResponse.json({ error: "Créditos insuficientes para esta operação." }, { status: 402 });
    console.error("[api]", e);
    return NextResponse.json({ error: "Algo deu errado. Tente novamente em instantes." }, { status: 500 });
  }
}
