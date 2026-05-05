/**
 * Local-filesystem storage driver. The Pi-friendly default — no buckets,
 * no IAM, just a directory on disk. "Presigned URLs" are short-lived
 * HMAC-signed routes on this same Next.js app.
 *
 * Layout under STORAGE_LOCAL_DIR:
 *   <feature|comment|brainDump>/<ownerId>/<uuid><ext>
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StorageDriver, PresignUploadResult } from './types';
import { signToken } from './sign';

const ROOT = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || './uploads');

function safeJoin(key: string): string {
  // Reject anything that could escape ROOT after normalisation.
  const resolved = path.resolve(ROOT, key);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

export const localDriver: StorageDriver = {
  name: 'local',

  async presignUpload({ key, mimeType, sizeBytes, ttlSeconds = 300 }): Promise<PresignUploadResult> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = signToken({ t: 'up', k: key, m: mimeType, s: sizeBytes, exp });
    return {
      uploadUrl: `/api/attachments/upload/${encodeURIComponent(token)}`,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      storageKey: key,
    };
  },

  async presignDownload({ key, filename, mimeType, ttlSeconds = 600 }) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = signToken({ t: 'dn', k: key, exp, fn: filename, mt: mimeType });
    return `/api/attachments/blob/${encodeURIComponent(token)}`;
  },

  async exists(key) {
    try { await fs.stat(safeJoin(key)); return true; } catch { return false; }
  },

  async delete(key) {
    try { await fs.unlink(safeJoin(key)); } catch { /* ignore missing */ }
  },
};

/** Internal helpers for the upload/blob routes (not part of StorageDriver). */
export const localFs = {
  root: ROOT,
  resolve: safeJoin,
  async writeStream(key: string, body: ArrayBuffer | Uint8Array) {
    const target = safeJoin(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const buf = body instanceof Uint8Array ? body : new Uint8Array(body);
    await fs.writeFile(target, buf);
    return fs.stat(target);
  },
  async read(key: string) {
    return fs.readFile(safeJoin(key));
  },
  async stat(key: string) {
    return fs.stat(safeJoin(key));
  },
};
