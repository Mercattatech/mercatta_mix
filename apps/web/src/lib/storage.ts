import "server-only";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "./env";

/** Tamanho de cada parte do envio (R2/S3 exigem ao menos 5 MB, exceto a última). 5 GB / 16 MB = 320 partes (limite: 10 000). */
export const UPLOAD_PART_SIZE = 16 * 1024 * 1024;

let s3: S3Client | undefined;
function client(): S3Client {
  const env = serverEnv();
  s3 ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
  return s3;
}

export const isLocalStorage = () => serverEnv().STORAGE_DRIVER === "local";

function localPath(key: string): string {
  const root = path.resolve(serverEnv().LOCAL_STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Chave de arquivo inválida");
  return full;
}

/** Envio em partes direto do navegador para o R2 (o arquivo não passa pelo servidor do site). */
export async function startMultipart(key: string, contentType: string): Promise<{ uploadId: string }> {
  const out = await client().send(new CreateMultipartUploadCommand({ Bucket: serverEnv().R2_BUCKET!, Key: key, ContentType: contentType }));
  if (!out.UploadId) throw new Error("O armazenamento não devolveu o id do envio");
  return { uploadId: out.UploadId };
}

export async function presignPart(key: string, uploadId: string, partNumber: number): Promise<string> {
  return getSignedUrl(client(), new UploadPartCommand({ Bucket: serverEnv().R2_BUCKET!, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 });
}

export async function completeMultipart(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]): Promise<void> {
  await client().send(
    new CompleteMultipartUploadCommand({
      Bucket: serverEnv().R2_BUCKET!,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await client().send(new AbortMultipartUploadCommand({ Bucket: serverEnv().R2_BUCKET!, Key: key, UploadId: uploadId }));
}

/** Modo local (desenvolvimento): o navegador envia o arquivo inteiro para a API, que grava na pasta. */
export async function saveLocal(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
  const dest = localPath(key);
  await mkdir(path.dirname(dest), { recursive: true });
  let received = 0;
  const limited = Readable.fromWeb(body as never).on("data", (c: Buffer) => {
    received += c.length;
    if (received > maxBytes) limited.destroy(new Error("Arquivo maior que o limite"));
  });
  await pipeline(limited, createWriteStream(dest));
  return (await stat(dest)).size;
}

/** Link temporário para baixar (R2) ou caminho de rota local (dev). */
export async function downloadUrl(key: string, filename: string, expiresInSeconds = 600): Promise<string> {
  if (isLocalStorage()) return `/api/files/local?key=${encodeURIComponent(key)}&name=${encodeURIComponent(filename)}`;
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: serverEnv().R2_BUCKET!, Key: key, ResponseContentDisposition: `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` }),
    { expiresIn: expiresInSeconds },
  );
}

export function localFilePath(key: string): string {
  return localPath(key);
}
