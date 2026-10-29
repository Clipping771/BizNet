import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

export interface UploadTicket {
  uploadUrl: string;
  key: string;
  method: "PUT";
  contentType: string;
  maxBytes: number;
  expiresIn: number;
}

export type UploadPurpose =
  | "verification_document"
  | "listing_image"
  | "shop_photo"
  | "request_image"
  | "quote_attachment"
  | "message_attachment";

const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "minioadmin";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "minioadmin";
export const S3_BUCKET_PUBLIC = process.env.S3_BUCKET_PUBLIC || "biznet-public";
export const S3_BUCKET_PRIVATE = process.env.S3_BUCKET_PRIVATE || "biznet-private";

const UPLOAD_TICKET_SECONDS = 15 * 60;

function signSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required to sign file URLs in production");
  }
  return secret || "dev-only-file-sign-secret-0123456789abcdef";
}

/**
 * Storage driver. "s3" (default) talks to S3/MinIO and never hides failures.
 * "memory" keeps files in process memory and exists only for tests and local
 * runs without MinIO; it is refused in production unless the app runs on localhost
 * (a local production build, e.g. Playwright).
 */
function isMemoryDriver(): boolean {
  if ((process.env.STORAGE_DRIVER || "s3") !== "memory") return false;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_MEMORY_STORAGE !== "true") {
    const host = new URL(process.env.APP_URL || "http://localhost").hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      throw new Error("STORAGE_DRIVER=memory is not allowed in production; configure S3");
    }
  }
  return true;
}

const memoryStorage = new Map<string, { buffer: Buffer; contentType: string }>();

export const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

const UPLOAD_RULES: Record<UploadPurpose, { types: string[]; maxBytes: number; prefix: string }> = {
  verification_document: {
    types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    maxBytes: 10 * 1024 * 1024,
    prefix: "private/verification",
  },
  listing_image: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
    prefix: "public/listings",
  },
  shop_photo: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
    prefix: "public/shops",
  },
  request_image: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
    prefix: "public/requests",
  },
  quote_attachment: {
    types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    maxBytes: 5 * 1024 * 1024,
    prefix: "private/quotes",
  },
  message_attachment: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
    prefix: "private/messages",
  },
};

/**
 * Validates file upload constraints (§8.3, B2).
 */
export function validateUploadParams(params: {
  contentType: string;
  sizeBytes: number;
  purpose: UploadPurpose;
}): { valid: boolean; error?: string } {
  const rule = UPLOAD_RULES[params.purpose];
  if (!rule) return { valid: false, error: "Unknown upload purpose" };
  if (!rule.types.includes(params.contentType)) {
    return {
      valid: false,
      error:
        params.purpose === "verification_document" || params.purpose === "quote_attachment"
          ? "Only JPEG, PNG, WEBP, or PDF files are accepted."
          : "Only JPEG, PNG, or WEBP images are accepted.",
    };
  }
  if (!(params.sizeBytes > 0) || params.sizeBytes > rule.maxBytes) {
    return {
      valid: false,
      error:
        params.purpose === "verification_document"
          ? "Verification document must not exceed 10MB."
          : "File must not exceed 5MB.",
    };
  }
  return { valid: true };
}

/** Key prefix for a business's files of the given purpose. */
export function businessFilePrefix(purpose: UploadPurpose, businessId: string): string {
  return `${UPLOAD_RULES[purpose].prefix}/${businessId}/`;
}

/**
 * Throws unless every key was uploaded by this business for this purpose.
 * Stops a record from pointing at another business's (or another purpose's) files.
 */
export function assertBusinessFileKeys(
  keys: unknown,
  purpose: UploadPurpose,
  businessId: string,
  max: number
): string[] {
  if (keys === undefined || keys === null) return [];
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string")) {
    throw new Error("Invalid file keys");
  }
  if (keys.length > max) {
    throw new Error(`At most ${max} files are allowed`);
  }
  const prefix = businessFilePrefix(purpose, businessId);
  for (const key of keys as string[]) {
    if (!key.startsWith(prefix) || key.includes("..")) {
      throw new Error("File does not belong to this business");
    }
  }
  return keys as string[];
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", signSecret()).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function uploadPayload(t: { key: string; contentType: string; maxBytes: number; expiresAt: number; userId: string }) {
  return `upload:${t.key}:${t.contentType}:${t.maxBytes}:${t.expiresAt}:${t.userId}`;
}

/**
 * Issues a short-lived upload ticket bound to one key, content type, size limit
 * and user. The PUT endpoint rejects anything that does not match it.
 */
export function createUploadTicket(params: {
  userId: string;
  businessId: string;
  filename: string;
  contentType: string;
  purpose: UploadPurpose;
}): UploadTicket {
  const rule = UPLOAD_RULES[params.purpose];
  const sanitizedName = params.filename.replace(/[^a-zA-Z0-9.-]/g, "_").slice(-80);
  const key = `${businessFilePrefix(params.purpose, params.businessId)}${crypto.randomBytes(16).toString("hex")}-${sanitizedName}`;
  const expiresAt = Date.now() + UPLOAD_TICKET_SECONDS * 1000;
  const sig = hmac(
    uploadPayload({ key, contentType: params.contentType, maxBytes: rule.maxBytes, expiresAt, userId: params.userId })
  );

  const baseUrl = process.env.APP_URL || "http://localhost:3000";
  const query = new URLSearchParams({
    ct: params.contentType,
    max: String(rule.maxBytes),
    exp: String(expiresAt),
    sig,
  });
  return {
    uploadUrl: `${baseUrl}/api/files/upload/${key.split("/").map(encodeURIComponent).join("/")}?${query}`,
    key,
    method: "PUT",
    contentType: params.contentType,
    maxBytes: rule.maxBytes,
    expiresIn: UPLOAD_TICKET_SECONDS,
  };
}

export function verifyUploadTicket(t: {
  key: string;
  contentType: string;
  maxBytes: number;
  expiresAt: number;
  userId: string;
  sig: string;
}): boolean {
  if (!Number.isFinite(t.expiresAt) || Date.now() > t.expiresAt) return false;
  return safeEqualHex(t.sig, hmac(uploadPayload(t)));
}

/**
 * Creates an HMAC signature for signed download URLs (5-minute expiry).
 */
export function generateSignedDownloadToken(key: string, expiresAt: number): string {
  return hmac(`download:${key}:${expiresAt}`);
}

/**
 * Verifies an HMAC signature and expiry for signed download URLs.
 */
export function verifySignedDownloadToken(key: string, expiresAt: number, signature: string): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return safeEqualHex(signature, generateSignedDownloadToken(key, expiresAt));
}

/**
 * Generates a 5-minute signed URL for private files (§8.3, B6).
 */
export async function getPrivateFileSignedUrl(key: string, expiresInSeconds: number = 300): Promise<string> {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const sig = generateSignedDownloadToken(key, expiresAt);
  const baseUrl = process.env.APP_URL || "http://localhost:3000";
  return `${baseUrl}/api/files/download?key=${encodeURIComponent(key)}&expires=${expiresAt}&sig=${sig}`;
}

const bucketFor = (isPrivate: boolean) => (isPrivate ? S3_BUCKET_PRIVATE : S3_BUCKET_PUBLIC);

function isNotFound(err: any): boolean {
  return err?.name === "NotFound" || err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
}

/**
 * Store file content. Throws if the storage backend fails.
 */
export async function putFile(key: string, buffer: Buffer, contentType: string, isPrivate: boolean = true) {
  if (isMemoryDriver()) {
    memoryStorage.set(key, { buffer, contentType });
    return;
  }
  await s3Client.send(
    new PutObjectCommand({ Bucket: bucketFor(isPrivate), Key: key, Body: buffer, ContentType: contentType })
  );
}

export async function fileExists(key: string, isPrivate: boolean = true): Promise<boolean> {
  if (isMemoryDriver()) return memoryStorage.has(key);
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucketFor(isPrivate), Key: key }));
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/**
 * Retrieve file content; null if it does not exist. Backend failures throw.
 */
export async function getFile(key: string, isPrivate: boolean = true): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (isMemoryDriver()) return memoryStorage.get(key) ?? null;
  try {
    const res = await s3Client.send(new GetObjectCommand({ Bucket: bucketFor(isPrivate), Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return { buffer: Buffer.from(bytes), contentType: res.ContentType || "application/octet-stream" };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Health check (§14): both buckets reachable; "memory" when the in-memory driver is on. */
export async function storageHealth(): Promise<"ok" | "memory"> {
  if (isMemoryDriver()) return "memory";
  const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
  await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_PUBLIC }));
  await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_PRIVATE }));
  return "ok";
}
