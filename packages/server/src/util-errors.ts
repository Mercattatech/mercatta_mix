/** Falha de um processo externo (FFmpeg, ffprobe, Python). */
export class ExecError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(message);
  }
}
