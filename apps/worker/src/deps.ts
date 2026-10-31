import type { Db } from "@mercatta/server";
import type { ObjectStore } from "./store";
import type { Transcriber } from "./transcriber";

/** Tudo que os handlers precisam: injetado para poder testar com banco/arquivos/transcritor falsos. */
export interface WorkerDeps {
  db: Db;
  store: ObjectStore;
  transcriber: Transcriber;
  /** Pasta onde cada job cria seu diretório temporário (apagado ao final). */
  tmpRoot: string;
  /** Pasta com fontes para a legenda (opcional; o Docker instala DejaVu Sans). */
  fontsDir?: string;
  /** false = não queima a legenda no vídeo (só para ambientes sem libass, como testes locais). Padrão: true. */
  burnCaptions?: boolean;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export function logger(deps: WorkerDeps): (msg: string, extra?: Record<string, unknown>) => void {
  return deps.log ?? ((msg, extra) => console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra })));
}
