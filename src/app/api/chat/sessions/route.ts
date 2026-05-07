import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/apiError';

/** List the current user's chat sessions (most-recent first). */
export async function GET() {
  try {
    const session = await requireUser();
    const sessions = await prisma.chatSession.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
    return NextResponse.json(sessions);
  } catch (e) { return handleError(e); }
}

/** Create a new empty chat session. */
export async function POST() {
  try {
    const session = await requireUser();
    const created = await prisma.chatSession.create({
      data: { userId: session.userId, title: 'New chat' },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) { return handleError(e); }
}
