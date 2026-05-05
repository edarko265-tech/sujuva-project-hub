/**
 * Local-driver download sink. Streams bytes from disk after verifying
 * the short-lived HMAC-signed download token. No session check — the
 * token IS the credential, minted only by /api/attachments/[id]/download
 * which performs RBAC.
 */
import { verifyToken, type DownloadTokenPayload } from '@/lib/storage/sign';
import { localFs } from '@/lib/storage/local';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const payload = verifyToken<DownloadTokenPayload>(token, 'dn');
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired download token' }, { status: 401 });
  }
  let buf: Buffer;
  try { buf = await localFs.read(payload.k); }
  catch { return NextResponse.json({ error: 'Not found' }, { status: 404 }); }

  const headers = new Headers();
  headers.set('Content-Type', payload.mt || 'application/octet-stream');
  headers.set('Content-Length', String(buf.byteLength));
  headers.set('Cache-Control', 'private, max-age=60');
  if (payload.fn) {
    // Disposition: inline so images/PDFs can preview; filename is a hint.
    const safe = payload.fn.replace(/["\\\r\n]/g, '_');
    headers.set('Content-Disposition', `inline; filename="${safe}"`);
  }
  return new Response(new Uint8Array(buf), { status: 200, headers });
}
