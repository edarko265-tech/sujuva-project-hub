import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditProject } from '@/lib/rbac';
import { recordActivity } from '@/lib/activityBus';
import { handleError } from '@/lib/apiError';

const roleSchema = z.enum(['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
const upsertSchema = z.object({
  userId: z.string().min(1),
  roleInProject: roleSchema,
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canEditProject(session.userId, session.role, params.id)) && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const members = await prisma.projectMember.findMany({
      where: { projectId: params.id },
      include: { user: { select: { id: true, name: true, email: true, active: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    return NextResponse.json(members);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canEditProject(session.userId, session.role, params.id)) && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId, roleInProject } = upsertSchema.parse(await req.json());
    const [project, user] = await Promise.all([
      prisma.project.findUnique({ where: { id: params.id }, select: { id: true, name: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, active: true } }),
    ]);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (!user || !user.active) return NextResponse.json({ error: 'User not found/active' }, { status: 404 });

    const membership = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: params.id, userId } },
      create: { projectId: params.id, userId, roleInProject },
      update: { roleInProject },
      include: { user: { select: { id: true, name: true, email: true, active: true } } },
    });

    await recordActivity({
      projectId: params.id,
      actorId: session.userId,
      actorName: session.name,
      type: 'ASSIGN',
      message: `${membership.user.name} assigned to project "${project.name}" as ${roleInProject}.`,
    });

    return NextResponse.json(membership);
  } catch (e) {
    return handleError(e);
  }
}

const deleteSchema = z.object({ userId: z.string().min(1) });

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canEditProject(session.userId, session.role, params.id)) && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { userId } = deleteSchema.parse(await req.json());

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: params.id, userId } },
      include: { user: { select: { name: true } }, project: { select: { name: true } } },
    });
    if (!membership) return NextResponse.json({ ok: true });

    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: params.id, userId } } });
    await recordActivity({
      projectId: params.id,
      actorId: session.userId,
      actorName: session.name,
      type: 'UPDATE',
      message: `${membership.user.name} removed from project "${membership.project.name}".`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
