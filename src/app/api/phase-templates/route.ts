import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleError } from '../projects/route';

export async function GET() {
  try {
    await requireRole(['ADMIN']);
    const list = await prisma.phaseTemplate.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json(list);
  } catch (e) { return handleError(e); }
}

const upsertSchema = z.object({
  templates: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    order: z.number().int().min(0),
    required: z.boolean().default(true),
  })),
});

export async function PUT(req: Request) {
  try {
    await requireRole(['ADMIN']);
    const { templates } = upsertSchema.parse(await req.json());
    await prisma.$transaction([
      prisma.phaseTemplate.deleteMany(),
      prisma.phaseTemplate.createMany({ data: templates.map(({ id: _id, ...t }) => t) }),
    ]);
    const list = await prisma.phaseTemplate.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json(list);
  } catch (e) { return handleError(e); }
}
