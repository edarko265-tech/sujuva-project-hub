/**
 * HMAC-SHA256 signed token helper used by the local storage driver to mint
 * short-lived "presigned" upload/download URLs that this Next.js app itself
 * verifies on the receiving route.
 *
 * Format: base64url(JSON payload).base64url(HMAC). No external dep needed —
 * only `node:crypto`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface UploadTokenPayload {
  k: string;       // storage key
  m: string;       // mime type
  s: number;       // max size bytes
  exp: number;     // unix seconds
  /** Discriminator so an upload token can't be replayed as a download. */
  t: 'up';
}

export interface DownloadTokenPayload {
  k: string;
  exp: number;
  fn?: string;     // download filename
  mt?: string;     // content-type override
  t: 'dn';
}

export type TokenPayload = UploadTokenPayload | DownloadTokenPayload;

function getSecret(): string {
  // Reuse SESSION_SECRET so we don't add another required env var.
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET (>=32 chars) required for storage signing');
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function hmac(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function signToken(payload: TokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function verifyToken<T extends TokenPayload>(token: string, expectKind: T['t']): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: TokenPayload;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch { return null; }
  if (parsed.t !== expectKind) return null;
  if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < Date.now()) return null;
  return parsed as T;
}
