import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole, requireUser, AuthError } from '@/lib/auth';
import { getProjectWithProgress } from '@/lib/completion';
import { recordActivity } from '@/lib/activityBus';

export async function GET() {
  try {
    const session = await requireUser();
    const where = session.role === 'ADMIN' ? {} : {
      OR: [
        { managerId: session.userId },
        { members: { some: { userId: session.userId } } },
      ],
    };
    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { phases: { include: { features: true } }, manager: true },
    });
    const enriched = await Promise.all(projects.map((p) => getProjectWithProgress(p.id)));
    return NextResponse.json(enriched.filter(Boolean));
  } catch (e) {
    return handleError(e);
  }
}

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  managerId: z.string().optional(),
  usePhaseTemplate: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const session = await requireRole(['ADMIN', 'MANAGER']);
    const body = await req.json();
    const data = createSchema.parse(body);
    const templates = data.usePhaseTemplate
      ? await prisma.phaseTemplate.findMany({ orderBy: { order: 'asc' } })
      : [];
    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        managerId: data.managerId ?? session.userId,
        members: { create: [{ userId: session.userId, roleInProject: session.role }] },
        phases: { create: templates.map((t) => ({ name: t.name, order: t.order, required: t.required })) },
      },
    });
    await recordActivity({
      projectId: project.id,
      actorId: session.userId,
      actorName: session.name,
      type: 'CREATE',
      message: `Project "${project.name}" created.`,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

export function handleError(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError) return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 });
  // eslint-disable-next-line no-console
  console.error(e);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
