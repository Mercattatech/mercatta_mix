import { spawn } from "node:child_process";
import { ExecError } from "@mercatta/server";

export { ExecError };

export interface RunOptions {
  cwd?: string;
  /** Devolve stdout como Buffer (para ler áudio cru). */
  binary?: boolean;
  signal?: AbortSignal;
}

/** Executa um binário sem shell (sem risco de injeção) e junta stdout/stderr. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, signal: opts.signal, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > 2_000_000) err = err.slice(-1_000_000); // evita estourar memória em logs enormes
    });
    child.on("error", (e) => reject(new ExecError(`Falha ao executar ${cmd}: ${e.message}`, null, err)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new ExecError(`${cmd} terminou com código ${code}`, code, err.slice(-4000)));
    });
  });
}
