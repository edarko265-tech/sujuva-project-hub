import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleError } from '../../projects/route';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(['ADMIN']);
    const data = patchSchema.parse(await req.json());
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: {
        name: data.name,
        role: data.role,
        active: data.active,
        passwordHash: data.password ? await bcrypt.hash(data.password, 10) : undefined,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    return NextResponse.json(updated);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(['ADMIN']);
    await prisma.user.update({ where: { id: params.id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
