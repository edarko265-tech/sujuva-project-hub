/**
 * Storage abstraction. Drivers are interchangeable behind this interface so
 * the API layer never has to care whether the bytes live on the local
 * filesystem, AWS S3, or Azure Blob.
 *
 * For the local driver, "presigned URLs" are short-lived signed JWT routes
 * served by this same Next.js app (see src/lib/storage/sign.ts).
 */
export interface PresignUploadResult {
  /** Absolute or root-relative URL the browser should PUT bytes to. */
  uploadUrl: string;
  method: 'PUT';
  /** Headers the browser must set on the upload request. */
  headers: Record<string, string>;
  /** Backend-specific identifier persisted on the Attachment row. */
  storageKey: string;
}

export interface StorageDriver {
  /** Identifier persisted on Attachment.backend. */
  readonly name: 'local' | 's3' | 'azure';

  presignUpload(args: {
    key: string;
    mimeType: string;
    sizeBytes: number;
    /** TTL for the upload URL (seconds). */
    ttlSeconds?: number;
  }): Promise<PresignUploadResult>;

  presignDownload(args: {
    key: string;
    filename?: string;
    mimeType?: string;
    ttlSeconds?: number;
  }): Promise<string>;

  /** True if the underlying object exists. Used by the confirm endpoint. */
  exists(key: string): Promise<boolean>;

  /** Best-effort delete; does not throw on missing keys. */
  delete(key: string): Promise<void>;
}
