/**
 * Active storage driver, selected by STORAGE_BACKEND env var.
 * S3 and Azure drivers are stubs for now — see docs/ROADMAP.md §1.6.
 */
import type { StorageDriver } from './types';
import { localDriver } from './local';

const BACKEND = (process.env.STORAGE_BACKEND || 'local').toLowerCase();

let driver: StorageDriver;
switch (BACKEND) {
  case 'local':
    driver = localDriver;
    break;
  case 's3':
  case 'azure':
    // eslint-disable-next-line no-console
    console.warn(`[storage] backend "${BACKEND}" not yet implemented; falling back to local`);
    driver = localDriver;
    break;
  default:
    throw new Error(`Unknown STORAGE_BACKEND: ${BACKEND}`);
}

export const storage: StorageDriver = driver;

export const UPLOAD_MAX_MB = Math.max(1, parseInt(process.env.UPLOAD_MAX_MB || '25', 10));
export const UPLOAD_MAX_BYTES = UPLOAD_MAX_MB * 1024 * 1024;

const DEFAULT_ALLOWED = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'text/csv',
  'application/zip',
].join(',');

export const UPLOAD_ALLOWED_MIME = (process.env.UPLOAD_ALLOWED_MIME || DEFAULT_ALLOWED)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isMimeAllowed(mime: string): boolean {
  return UPLOAD_ALLOWED_MIME.includes(mime.toLowerCase());
}

export function buildStorageKey(opts: {
  ownerType: 'feature' | 'comment' | 'brainDump';
  ownerId: string;
  filename: string;
}): string {
  const ext = (opts.filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '').toLowerCase();
  // Use crypto.randomUUID via global available in Node 22 / Edge.
  const uuid = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
  return `${opts.ownerType}/${opts.ownerId}/${uuid}${ext}`;
}
