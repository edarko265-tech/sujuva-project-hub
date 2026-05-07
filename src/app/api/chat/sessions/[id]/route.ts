import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/apiError';

async function ownSession(id: string, userId: string) {
  const s = await prisma.chatSession.findUnique({ where: { id } });
  if (!s || s.userId !== userId) return null;
  return s;
}

/** Get a session with its full message history. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const owned = await ownSession(params.id, session.userId);
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: owned.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    return NextResponse.json({ id: owned.id, title: owned.title, messages });
  } catch (e) { return handleError(e); }
}

const renameSchema = z.object({ title: z.string().min(1).max(120) });

/** Rename. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const owned = await ownSession(params.id, session.userId);
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { title } = renameSchema.parse(await req.json());
    const updated = await prisma.chatSession.update({ where: { id: owned.id }, data: { title } });
    return NextResponse.json(updated);
  } catch (e) { return handleError(e); }
}

/** Delete a session (cascades messages). */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    const owned = await ownSession(params.id, session.userId);
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.chatSession.delete({ where: { id: owned.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
