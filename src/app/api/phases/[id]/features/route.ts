import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditProject } from '@/lib/rbac';
import { handleError } from '../../../projects/route';

const featureSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  completion: z.number().int().min(0).max(100).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  tags: z.string().optional(),
  link: z.string().url().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const phase = await prisma.phase.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!phase) return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
    if (!(await canEditProject(session.userId, session.role, phase.projectId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const data = featureSchema.parse(await req.json());
    const feature = await prisma.feature.create({
      data: {
        phaseId: params.id,
        title: data.title,
        description: data.description,
        status: data.status ?? 'NOT_STARTED',
        priority: data.priority ?? 'MEDIUM',
        completion: data.completion ?? 0,
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        tags: data.tags,
        link: data.link ?? null,
      },
    });
    await prisma.activity.create({
      data: { projectId: phase.projectId, featureId: feature.id, actorId: session.userId, type: 'CREATE', message: `Feature "${feature.title}" created.` },
    });
    return NextResponse.json(feature, { status: 201 });
  } catch (e) { return handleError(e); }
}
