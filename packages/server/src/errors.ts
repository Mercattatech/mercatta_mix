import { ExecError } from "./util-errors";

/** Erro cujo texto já é para o cliente (em português). */
export class UserFacingError extends Error {}

/** Converte qualquer erro técnico numa mensagem em português para o cliente. */
export function toFriendlyError(e: unknown): string {
  if (e instanceof UserFacingError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof ExecError || /ffmpeg|ffprobe/i.test(msg)) {
    if (/Invalid data found|moov atom not found|could not find codec/i.test(msg + (e instanceof ExecError ? e.stderr : ""))) {
      return "Não conseguimos ler este arquivo de vídeo. Ele pode estar corrompido ou incompleto: tente exportar de novo.";
    }
    return "Houve um problema ao processar o vídeo. Já tentamos de novo; se persistir, fale com o suporte.";
  }
  if (/insufficient_credits/.test(msg)) return "Créditos insuficientes para esta operação.";
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg)) return "Falha de conexão temporária. Vamos tentar novamente.";
  return "Algo deu errado. Tente novamente em instantes.";
}
