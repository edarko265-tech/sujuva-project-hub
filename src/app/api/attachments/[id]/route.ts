/**
 * Per-attachment routes:
 *   POST /api/attachments/[id]/confirm    – flip PENDING → READY
 *   GET  /api/attachments/[id]/download   – issue signed URL & 302 redirect
 *   DELETE /api/attachments/[id]          – soft-delete + cleanup object
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditFeature, canViewProject } from '@/lib/rbac';
import { storage } from '@/lib/storage';
import { recordActivity } from '@/lib/activityBus';
import { handleError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function loadWithContext(id: string) {
  return prisma.attachment.findUnique({
    where: { id },
    include: {
      feature: { include: { phase: true } },
      comment: { include: { feature: { include: { phase: true } } } },
      brainDump: true,
    },
  });
}

function projectIdOf(att: NonNullable<Awaited<ReturnType<typeof loadWithContext>>>): string | null {
  if (att.feature) return att.feature.phase.projectId;
  if (att.comment) return att.comment.feature.phase.projectId;
  if (att.brainDump) return att.brainDump.projectId;
  return null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  // Used by the UI to fetch a presigned download URL.
  try {
    const session = await requireUser();
    const att = await loadWithContext(params.id);
    if (!att || att.status === 'DELETED') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const pid = projectIdOf(att);
    if (pid && !(await canViewProject(session.userId, session.role, pid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const url = await storage.presignDownload({
      key: att.storageKey,
      filename: att.filename,
      mimeType: att.mimeType,
    });
    return NextResponse.json({ url, filename: att.filename, mimeType: att.mimeType, sizeBytes: att.sizeBytes });
  } catch (e) {
    return handleError(e);
  }
}

const confirmSchema = z.object({ checksum: z.string().max(128).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const att = await loadWithContext(params.id);
    if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (att.uploaderId !== session.userId && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const data = confirmSchema.parse(await req.json().catch(() => ({})));

    // Verify the object actually landed in storage before flipping to READY.
    if (!(await storage.exists(att.storageKey))) {
      return NextResponse.json({ error: 'Upload not found in storage' }, { status: 409 });
    }

    const updated = await prisma.attachment.update({
      where: { id: att.id },
      data: { status: 'READY', checksum: data.checksum ?? null },
    });

    const pid = projectIdOf(att);
    if (att.feature) {
      await recordActivity({
        projectId: pid,
        featureId: att.feature.id,
        actorId: session.userId,
        actorName: session.name,
        type: 'UPDATE',
        message: `Attached "${att.filename}" to "${att.feature.title}".`,
      });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const att = await loadWithContext(params.id);
    if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const pid = projectIdOf(att);
    const isManager = pid
      ? (await prisma.project.findUnique({ where: { id: pid } }))?.managerId === session.userId
      : false;
    const allowed =
      session.role === 'ADMIN' ||
      att.uploaderId === session.userId ||
      isManager;
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.attachment.update({
      where: { id: att.id },
      data: { status: 'DELETED' },
    });
    await storage.delete(att.storageKey).catch(() => { /* best-effort */ });

    if (att.feature) {
      await recordActivity({
        projectId: pid,
        featureId: att.feature.id,
        actorId: session.userId,
        actorName: session.name,
        type: 'UPDATE',
        message: `Removed attachment "${att.filename}" from "${att.feature.title}".`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
