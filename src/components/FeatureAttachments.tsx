'use client';
import { useEffect, useRef, useState } from 'react';

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploader?: { id: string; name: string } | null;
}

interface Props {
  featureId: string;
  canEdit: boolean;
  currentUserId: string;
  isAdmin: boolean;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FeatureAttachments({ featureId, canEdit, currentUserId, isAdmin }: Props) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const res = await fetch(`/api/features/${featureId}/attachments`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      setItems(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [featureId]);

  async function uploadOne(file: File) {
    setError(null);
    // 1) presign
    const presignRes = await fetch('/api/attachments/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerType: 'feature',
        ownerId: featureId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      }),
    });
    if (!presignRes.ok) {
      throw new Error((await presignRes.json()).error || 'Presign failed');
    }
    const { attachmentId, upload } = await presignRes.json();

    // 2) PUT bytes
    const putRes = await fetch(upload.uploadUrl, {
      method: upload.method,
      headers: upload.headers,
      body: file,
    });
    if (!putRes.ok) {
      throw new Error((await putRes.json().catch(() => ({}))).error || 'Upload failed');
    }

    // 3) confirm
    const confirmRes = await fetch(`/api/attachments/${attachmentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!confirmRes.ok) {
      throw new Error((await confirmRes.json()).error || 'Confirm failed');
    }
  }

  async function handleFiles(files: FileList | File[]) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        await uploadOne(f);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function open(att: Attachment) {
    try {
      const res = await fetch(`/api/attachments/${att.id}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Cannot open');
      const { url } = await res.json();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot open');
    }
  }

  async function remove(att: Attachment) {
    if (!confirm(`Delete attachment "${att.filename}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/attachments/${att.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  function canRemove(att: Attachment) {
    return isAdmin || (att.uploader && att.uploader.id === currentUserId) || canEdit;
  }

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Attachments</span>
        {canEdit && (
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Uploading…' : '+ Upload'}
          </button>
        )}
      </div>

      {canEdit && (
        <div
          className={`mb-2 rounded-md border-2 border-dashed px-3 py-2 text-xs text-slate-500 transition ${
            dragging ? 'border-brand-navy bg-slate-50' : 'border-slate-200'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
          }}
        >
          Drag & drop files here, or click <em>+ Upload</em>.
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>
      )}

      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

      {items === null && <div className="text-xs text-slate-400">Loading…</div>}
      {items && items.length === 0 && <div className="text-xs text-slate-400">No attachments yet.</div>}
      {items && items.length > 0 && (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                className="text-brand-navy hover:underline truncate text-left flex-1"
                onClick={() => open(a)}
                title={a.filename}
              >
                📎 {a.filename}
              </button>
              <span className="text-slate-400 whitespace-nowrap">{fmtSize(a.sizeBytes)}</span>
              {canRemove(a) && (
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => remove(a)}
                  aria-label="Delete attachment"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
