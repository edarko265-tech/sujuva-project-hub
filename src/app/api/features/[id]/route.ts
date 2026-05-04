import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditFeature } from '@/lib/rbac';
import { handleError } from '../../projects/route';

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  completion: z.number().int().min(0).max(100).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  tags: z.string().nullable().optional(),
  link: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canEditFeature(session.userId, session.role, params.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const data = patchSchema.parse(await req.json());
    const before = await prisma.feature.findUnique({ where: { id: params.id }, include: { phase: true } });
    if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const feature = await prisma.feature.update({
      where: { id: params.id },
      data: {
        ...data,
        dueDate: data.dueDate === undefined ? undefined : data.dueDate ? new Date(data.dueDate) : null,
      },
    });
    const changes: string[] = [];
    if (data.status && data.status !== before.status) changes.push(`status → ${data.status}`);
    if (data.completion != null && data.completion !== before.completion) changes.push(`progress → ${data.completion}%`);
    if (data.assigneeId !== undefined && data.assigneeId !== before.assigneeId) changes.push('reassigned');
    await prisma.activity.create({
      data: {
        projectId: before.phase.projectId,
        featureId: feature.id,
        actorId: session.userId,
        type: 'UPDATE',
        message: `Feature "${feature.title}" updated${changes.length ? ': ' + changes.join(', ') : ''}.`,
      },
    });
    return NextResponse.json(feature);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canEditFeature(session.userId, session.role, params.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await prisma.feature.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}

const commentSchema = z.object({ body: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const feature = await prisma.feature.findUnique({ where: { id: params.id }, include: { phase: true } });
    if (!feature) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // contributor+ in any project they can view can comment
    if (session.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const data = commentSchema.parse(await req.json());
    const comment = await prisma.comment.create({
      data: { featureId: params.id, authorId: session.userId, body: data.body },
    });
    await prisma.activity.create({
      data: {
        projectId: feature.phase.projectId,
        featureId: feature.id,
        actorId: session.userId,
        type: 'COMMENT',
        message: `New comment on "${feature.title}".`,
      },
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (e) { return handleError(e); }
}
