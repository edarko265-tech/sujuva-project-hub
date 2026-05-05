/**
 * Attachment API routes.
 *
 * - POST /api/attachments/presign     → validate + create PENDING row, return signed upload URL
 * - PUT  /api/attachments/upload/[t]  → local-driver upload sink (verifies signed token)
 * - POST /api/attachments/[id]/confirm→ flip PENDING → READY after object lands in storage
 * - GET  /api/attachments/[id]/download → returns a short-lived signed download URL
 * - GET  /api/attachments/blob/[t]    → local-driver streamed download (verifies signed token)
 * - DELETE /api/attachments/[id]      → soft-delete + best-effort object cleanup
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditFeature, canViewProject } from '@/lib/rbac';
import { storage, isMimeAllowed, UPLOAD_MAX_BYTES, UPLOAD_MAX_MB, buildStorageKey } from '@/lib/storage';
import { recordActivity } from '@/lib/activityBus';
import { handleError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const presignSchema = z.object({
  ownerType: z.enum(['feature', 'comment', 'brainDump']),
  ownerId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    const session = await requireUser();
    const body = presignSchema.parse(await req.json());

    if (body.sizeBytes > UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${UPLOAD_MAX_MB} MB limit` },
        { status: 413 },
      );
    }
    if (!isMimeAllowed(body.mimeType)) {
      return NextResponse.json(
        { error: `MIME type "${body.mimeType}" not allowed` },
        { status: 415 },
      );
    }

    // RBAC: must have write access to the parent.
    let projectIdForActivity: string | null = null;
    let featureTitle: string | null = null;

    if (body.ownerType === 'feature') {
      const feat = await prisma.feature.findUnique({
        where: { id: body.ownerId },
        include: { phase: true },
      });
      if (!feat) return NextResponse.json({ error: 'Feature not found' }, { status: 404 });
      if (!(await canEditFeature(session.userId, session.role, feat.id))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      projectIdForActivity = feat.phase.projectId;
      featureTitle = feat.title;
    } else if (body.ownerType === 'comment') {
      const comment = await prisma.comment.findUnique({
        where: { id: body.ownerId },
        include: { feature: { include: { phase: true } } },
      });
      if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
      if (comment.authorId !== session.userId && session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      projectIdForActivity = comment.feature.phase.projectId;
    } else {
      const bd = await prisma.brainDump.findUnique({ where: { id: body.ownerId } });
      if (!bd) return NextResponse.json({ error: 'Brain dump not found' }, { status: 404 });
      if (bd.authorId !== session.userId && session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      projectIdForActivity = bd.projectId;
    }

    const key = buildStorageKey({
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      filename: body.filename,
    });
    const presign = await storage.presignUpload({
      key,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });

    const attachment = await prisma.attachment.create({
      data: {
        featureId: body.ownerType === 'feature' ? body.ownerId : null,
        commentId: body.ownerType === 'comment' ? body.ownerId : null,
        brainDumpId: body.ownerType === 'brainDump' ? body.ownerId : null,
        uploaderId: session.userId,
        filename: body.filename.slice(0, 255),
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        storageKey: key,
        backend: storage.name,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      attachmentId: attachment.id,
      upload: presign,
      // Surface for activity tracking on confirm
      _ctx: { projectId: projectIdForActivity, featureTitle },
    }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
