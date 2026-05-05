/**
 * Local-driver upload sink. Browser PUTs raw bytes here using the
 * short-lived HMAC-signed token returned by /api/attachments/presign.
 *
 * No session check — the signed token IS the credential. We re-validate
 * mime + size on receive so a malicious client can't lie about either.
 */
import { NextResponse } from 'next/server';
import { verifyToken, type UploadTokenPayload } from '@/lib/storage/sign';
import { localFs } from '@/lib/storage/local';
import { isMimeAllowed, UPLOAD_MAX_BYTES } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const payload = verifyToken<UploadTokenPayload>(token, 'up');
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired upload token' }, { status: 401 });
  }
  const contentType = req.headers.get('content-type') || '';
  if (contentType.toLowerCase() !== payload.m.toLowerCase()) {
    return NextResponse.json({ error: 'Content-Type mismatch' }, { status: 400 });
  }
  if (!isMimeAllowed(payload.m)) {
    return NextResponse.json({ error: 'MIME type not allowed' }, { status: 415 });
  }
  const declaredLen = parseInt(req.headers.get('content-length') || '0', 10);
  if (declaredLen > 0 && declaredLen > Math.min(payload.s, UPLOAD_MAX_BYTES)) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength > Math.min(payload.s, UPLOAD_MAX_BYTES)) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  await localFs.writeStream(payload.k, buf);
  return NextResponse.json({ ok: true, sizeBytes: buf.byteLength });
}
