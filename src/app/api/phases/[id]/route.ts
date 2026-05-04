import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditProject } from '@/lib/rbac';
import { handleError } from '../../projects/route';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
  required: z.boolean().optional(),
  weight: z.number().int().min(1).max(10).optional(),
});

async function getProjectIdForPhase(phaseId: string) {
  const p = await prisma.phase.findUnique({ where: { id: phaseId }, select: { projectId: true } });
  return p?.projectId ?? null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const projectId = await getProjectIdForPhase(params.id);
    if (!projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canEditProject(session.userId, session.role, projectId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const data = patchSchema.parse(await req.json());
    const phase = await prisma.phase.update({ where: { id: params.id }, data });
    return NextResponse.json(phase);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const projectId = await getProjectIdForPhase(params.id);
    if (!projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canEditProject(session.userId, session.role, projectId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const featCount = await prisma.feature.count({ where: { phaseId: params.id } });
    if (featCount > 0) {
      return NextResponse.json({ error: 'Phase has features; move/delete them first.' }, { status: 400 });
    }
    await prisma.phase.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
