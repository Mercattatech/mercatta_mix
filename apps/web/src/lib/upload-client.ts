"use client";

/** Envio de vídeos do navegador: em partes direto ao R2 (com nova tentativa por parte) ou inteiro para a API no modo local. */

export interface UploadOptions {
  projectId: string;
  type: string;
  file: File;
  language: string;
  onProgress: (fraction: number) => void;
  signal?: AbortSignal;
}

const MAX_PART_RETRIES = 3;
const PARALLEL_PARTS = 3;

async function api<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Falha na comunicação com o servidor.");
  return json;
}

function putWithProgress(url: string, body: Blob, onProgress: (loaded: number) => void, signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader("ETag")) : reject(new Error(`O envio foi recusado (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("A conexão caiu durante o envio."));
    xhr.onabort = () => reject(new DOMException("Envio cancelado", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export async function uploadVideo(opts: UploadOptions): Promise<{ sourceVideoId: string }> {
  const { file, projectId, type, language, onProgress, signal } = opts;
  const init = await api<{ sourceVideoId: string; mode: "local" | "r2"; uploadId?: string; partSize?: number; parts?: number }>("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, type, filename: file.name, sizeBytes: file.size }),
    signal,
  });

  if (init.mode === "local") {
    await putWithProgress(`/api/uploads/${init.sourceVideoId}/local`, file, (l) => onProgress(l / file.size), signal);
    await api(`/api/uploads/${init.sourceVideoId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language }), signal });
    return { sourceVideoId: init.sourceVideoId };
  }

  const partSize = init.partSize!;
  const total = init.parts!;
  const loadedByPart = new Array<number>(total).fill(0);
  const etags: { PartNumber: number; ETag: string }[] = [];
  const report = () => onProgress(loadedByPart.reduce((a, b) => a + b, 0) / file.size);
  let next = 0;

  async function sendPart(index: number) {
    const blob = file.slice(index * partSize, Math.min(file.size, (index + 1) * partSize));
    for (let attempt = 1; ; attempt++) {
      try {
        const { url } = await api<{ url: string }>(`/api/uploads/${init.sourceVideoId}/part`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId: init.uploadId, partNumber: index + 1 }),
          signal,
        });
        const etag = await putWithProgress(url, blob, (l) => ((loadedByPart[index] = l), report()), signal);
        if (!etag) throw new Error("O armazenamento não devolveu a confirmação da parte (verifique o CORS do bucket: ExposeHeaders ETag).");
        loadedByPart[index] = blob.size;
        report();
        etags.push({ PartNumber: index + 1, ETag: etag });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError" || attempt >= MAX_PART_RETRIES) throw e;
        loadedByPart[index] = 0;
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PARALLEL_PARTS, total) }, async () => {
      while (next < total) await sendPart(next++);
    }),
  );
  await api(`/api/uploads/${init.sourceVideoId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: init.uploadId, parts: etags, language }),
    signal,
  });
  return { sourceVideoId: init.sourceVideoId };
}

/** Duração do vídeo lida no navegador, para avisar do limite de 3 minutos antes de enviar (a checagem oficial é no servidor). */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 5000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(video.duration) ? video.duration * 1000 : null);
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    video.src = url;
  });
}
