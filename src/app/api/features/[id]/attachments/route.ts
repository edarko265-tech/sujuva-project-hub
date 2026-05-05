/**
 * List READY attachments for a feature. RBAC: must be able to view the
 * project the feature belongs to.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canViewProject } from '@/lib/rbac';
import { handleError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const feature = await prisma.feature.findUnique({
      where: { id: params.id },
      include: { phase: true },
    });
    if (!feature) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canViewProject(session.userId, session.role, feature.phase.projectId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const items = await prisma.attachment.findMany({
      where: { featureId: feature.id, status: 'READY' },
      orderBy: { createdAt: 'desc' },
      include: { uploader: { select: { id: true, name: true } } },
    });
    return NextResponse.json(items);
  } catch (e) {
    return handleError(e);
  }
}
