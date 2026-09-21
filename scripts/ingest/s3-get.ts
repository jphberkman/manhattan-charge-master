/**
 * S3-compatible GET against Neon object storage (path-style).
 * Credentials never leave env vars; this module does not log secrets.
 */
import { createHash, createHmac } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function storageConfigFromEnv(): StorageConfig {
  const endpoint = process.env.NEON_STORAGE_ENDPOINT;
  const accessKeyId = process.env.NEON_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.NEON_STORAGE_SECRET_ACCESS_KEY;
  const bucket = process.env.NEON_STORAGE_BUCKET || "shopforcare-price-transparency";
  const region = process.env.NEON_STORAGE_REGION || "us-east-1";
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Set NEON_STORAGE_ENDPOINT, NEON_STORAGE_ACCESS_KEY_ID, NEON_STORAGE_SECRET_ACCESS_KEY (ingest only; not needed on Vercel request path).",
    );
  }
  return { endpoint: endpoint.replace(/\/$/, ""), region, bucket, accessKeyId, secretAccessKey };
}

function hmac(key: Buffer | string, msg: string): Buffer {
  return createHmac("sha256", key).update(msg, "utf8").digest();
}

function encodePath(bucket: string, objectKey: string): string {
  const parts = [bucket, ...objectKey.split("/")].map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`));
  return "/" + parts.join("/");
}

function signGet(cfg: StorageConfig, objectKey: string, extraHeaders: Record<string, string> = {}): { url: string; headers: Record<string, string> } {
  const url = new URL(cfg.endpoint);
  const host = url.host;
  const canonicalUri = encodePath(cfg.bucket, objectKey);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const datestamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update("").digest("hex");
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };
  const signedHeaderNames = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${headers[k].trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = ["GET", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${datestamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const kDate = hmac("AWS4" + cfg.secretAccessKey, datestamp);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: `${cfg.endpoint}${canonicalUri}`, headers };
}

export async function getObjectToFile(cfg: StorageConfig, objectKey: string, dest: string): Promise<void> {
  const { url, headers } = signGet(cfg, objectKey);
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`S3 GET ${objectKey} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(dest));
}

export async function getObjectText(cfg: StorageConfig, objectKey: string): Promise<string> {
  const { url, headers } = signGet(cfg, objectKey);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`S3 GET ${objectKey} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.text();
}
