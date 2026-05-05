import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { chat, type ChatMessage } from '@/lib/ai';
import { getProjectWithProgress } from '@/lib/completion';
import { handleError } from '@/lib/apiError';

const schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).min(1),
});

export async function POST(req: Request) {
  try {
    const session = await requireUser();
    const { messages } = schema.parse(await req.json());

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

    const reply = await chat(messages as ChatMessage[], {
      userId: session.userId,
      userName: session.name,
      role: session.role,
      accessibleProjects: accessible,
    });
    return NextResponse.json({ reply });
  } catch (e) { return handleError(e); }
}
