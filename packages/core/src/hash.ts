import { createHash } from "node:crypto";

/** JSON com chaves ordenadas: mesma entrada lógica gera sempre a mesma string. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash de um plano/parâmetros de render. Identifica renders idênticos (reaproveitamento). */
export function planHash(plan: unknown): string {
  return sha256Hex(stableStringify(plan));
}

/** Chave de idempotência de um job: o mesmo tipo + as mesmas entradas = o mesmo job. */
export function jobIdempotencyKey(kind: string, inputs: unknown): string {
  return `${kind}:${sha256Hex(stableStringify(inputs))}`;
}
