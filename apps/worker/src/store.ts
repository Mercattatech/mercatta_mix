import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Armazenamento de arquivos (Cloudflare R2 em produção; pasta local em testes e no desenvolvimento). */
export interface ObjectStore {
  download(key: string, destPath: string): Promise<void>;
  upload(srcPath: string, key: string, contentType: string): Promise<{ sizeBytes: number }>;
  delete(key: string): Promise<void>;
  /** URL temporária de leitura (R2: assinada; local: caminho do arquivo). */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

function safeKey(key: string): string {
  const norm = path.posix.normalize(key);
  if (norm.startsWith("..") || path.posix.isAbsolute(norm) || norm.includes("\0")) throw new Error(`Chave de arquivo inválida: ${key}`);
  return norm;
}

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    return path.join(this.root, safeKey(key));
  }
  async download(key: string, destPath: string): Promise<void> {
    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(this.resolve(key), destPath);
  }
  async upload(srcPath: string, key: string): Promise<{ sizeBytes: number }> {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(srcPath, dest);
    return { sizeBytes: (await stat(dest)).size };
  }
  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
  async signedUrl(key: string): Promise<string> {
    return this.resolve(key);
  }
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class R2ObjectStore implements ObjectStore {
  private readonly s3: S3Client;
  constructor(private readonly cfg: R2Config) {
    this.s3 = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  async download(key: string, destPath: string): Promise<void> {
    await mkdir(path.dirname(destPath), { recursive: true });
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: safeKey(key) }));
    if (!res.Body) throw new Error(`Arquivo vazio no storage: ${key}`);
    await pipeline(res.Body as NodeJS.ReadableStream, createWriteStream(destPath));
  }
  async upload(srcPath: string, key: string, contentType: string): Promise<{ sizeBytes: number }> {
    const size = (await stat(srcPath)).size;
    await new Upload({
      client: this.s3,
      params: { Bucket: this.cfg.bucket, Key: safeKey(key), Body: createReadStream(srcPath), ContentType: contentType },
      queueSize: 4,
      partSize: 16 * 1024 * 1024,
    }).done();
    return { sizeBytes: size };
  }
  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: safeKey(key) }));
  }
  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.cfg.bucket, Key: safeKey(key) }), { expiresIn: expiresInSeconds });
  }
}
