import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { recordActivity } from '@/lib/activityBus';
import { handleError } from '@/lib/apiError';

const editSchema = z.object({
  rawText: z.string().min(1).optional(),
  proposedTitle: z.string().min(1).max(160).nullable().optional(),
  proposedDescription: z.string().max(4000).nullable().optional(),
});

async function loadOwned(id: string, userId: string, isAdmin: boolean) {
  const dump = await prisma.brainDump.findUnique({ where: { id } });
  if (!dump) return { dump: null as null, forbidden: false };
  if (!isAdmin && dump.authorId !== userId) return { dump, forbidden: true };
  return { dump, forbidden: false };
}

/** Edit raw text / proposed title / description. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (session.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { dump, forbidden } = await loadOwned(params.id, session.userId, session.role === 'ADMIN');
    if (!dump) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = editSchema.parse(await req.json());
    const updated = await prisma.brainDump.update({
      where: { id: dump.id },
      data: {
        rawText: body.rawText ?? dump.rawText,
        proposedTitle: body.proposedTitle === undefined ? dump.proposedTitle : body.proposedTitle,
        proposedDescription:
          body.proposedDescription === undefined ? dump.proposedDescription : body.proposedDescription,
      },
    });

    await recordActivity({
      projectId: dump.projectId ?? null,
      actorId: session.userId,
      actorName: session.name,
      type: 'UPDATE',
      message: 'Brain-dump edited.',
    });

    return NextResponse.json(updated);
  } catch (e) { return handleError(e); }
}

/** Delete a brain-dump. */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (session.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { dump, forbidden } = await loadOwned(params.id, session.userId, session.role === 'ADMIN');
    if (!dump) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await prisma.brainDump.delete({ where: { id: dump.id } });
    await recordActivity({
      projectId: dump.projectId ?? null,
      actorId: session.userId,
      actorName: session.name,
      type: 'DELETE',
      message: 'Brain-dump deleted.',
    });

    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
