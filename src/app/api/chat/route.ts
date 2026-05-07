import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { chat, type ChatMessage } from '@/lib/ai';
import { getProjectWithProgress } from '@/lib/completion';
import { handleError } from '@/lib/apiError';

const schema = z.object({
  sessionId: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).min(1),
});

function deriveTitle(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

export async function POST(req: Request) {
  try {
    const session = await requireUser();
    const { sessionId, messages } = schema.parse(await req.json());

    // Build accessible projects context
    const where = session.role === 'ADMIN' ? {} : {
      OR: [
        { managerId: session.userId },
        { members: { some: { userId: session.userId } } },
      ],
    };
    const projects = await prisma.project.findMany({ where, select: { id: true } });
    const accessible = (await Promise.all(projects.map((p) => getProjectWithProgress(p.id))))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ id: p.id, name: p.name, completion: p.completion, currentPhase: p.currentPhase }));

    // Resolve / create owned chat session
    let chatSession = sessionId
      ? await prisma.chatSession.findUnique({ where: { id: sessionId } })
      : null;
    if (chatSession && chatSession.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: { userId: session.userId, title: 'New chat' },
      });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');

    const reply = await chat(messages as ChatMessage[], {
      userId: session.userId,
      userName: session.name,
      role: session.role,
      accessibleProjects: accessible,
    });

    const sessionUpdate: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
    if (chatSession.title === 'New chat' && lastUser) sessionUpdate.title = deriveTitle(lastUser.content);

    await Promise.all([
      lastUser
        ? prisma.chatMessage.create({
            data: { sessionId: chatSession.id, role: 'user', content: lastUser.content },
          })
        : Promise.resolve(),
      prisma.chatMessage.create({
        data: { sessionId: chatSession.id, role: 'assistant', content: reply },
      }),
      prisma.chatSession.update({ where: { id: chatSession.id }, data: sessionUpdate }),
    ]);

    return NextResponse.json({
      reply,
      sessionId: chatSession.id,
      title: sessionUpdate.title ?? chatSession.title,
    });
  } catch (e) { return handleError(e); }
}
