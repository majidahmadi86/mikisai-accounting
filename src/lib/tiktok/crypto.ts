import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Shop tokens at rest: AES-256-GCM with a server-only key from
 * TIKTOK_TOKEN_KEY (32 bytes, base64 or hex). Stored as base64 of
 * iv (12 bytes) + tag (16 bytes) + ciphertext.
 */
export function tokenKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.TIKTOK_TOKEN_KEY?.trim();
  if (!raw) throw new Error("TIKTOK_TOKEN_KEY is not set");
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("TIKTOK_TOKEN_KEY must be 32 bytes (base64 or hex)");
  return buf;
}

export function encryptSecret(plain: string, key: Buffer = tokenKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(stored: string, key: Buffer = tokenKey()): string {
  const buf = Buffer.from(stored, "base64");
  if (buf.length < 29) throw new Error("stored secret is too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** OAuth state: who started the authorization, signed so the callback can trust it, valid for fifteen minutes. */
export function signState(payload: { businessId: string; userId: string; at: number }, secret: string): string {
  const body = `${payload.businessId}.${payload.userId}.${payload.at}`;
  const mac = createHmac("sha256", secret).update(body).digest("hex");
  return Buffer.from(`${body}.${mac}`, "utf8").toString("base64url");
}

export function verifyState(state: string, secret: string, now = Date.now(), maxAgeMs = 15 * 60 * 1000): { businessId: string; userId: string } | null {
  let decoded: string;
  try {
    decoded = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const parts = decoded.split(".");
  if (parts.length !== 4) return null;
  const [businessId, userId, at, mac] = parts;
  const expected = createHmac("sha256", secret).update(`${businessId}.${userId}.${at}`).digest("hex");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const started = Number(at);
  if (!Number.isFinite(started) || now - started > maxAgeMs || started > now + 60_000) return null;
  return { businessId, userId };
}
