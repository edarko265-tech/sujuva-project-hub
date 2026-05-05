import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditProject, canViewProject } from '@/lib/rbac';
import { getProjectWithProgress } from '@/lib/completion';
import { recordActivity } from '@/lib/activityBus';
import { handleError } from '../route';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canViewProject(session.userId, session.role, params.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const project = await getProjectWithProgress(params.id);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(project);
  } catch (e) { return handleError(e); }
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  managerId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canEditProject(session.userId, session.role, params.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const data = patchSchema.parse(await req.json());
    const updated = await prisma.project.update({ where: { id: params.id }, data });
    await recordActivity({
      projectId: params.id,
      actorId: session.userId,
      actorName: session.name,
      type: 'UPDATE',
      message: 'Project updated.',
    });
    return NextResponse.json(updated);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await prisma.project.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
