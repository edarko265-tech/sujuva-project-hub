import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSession, requireUser } from '@/lib/auth';
import { handleError } from '@/lib/apiError';

const patchSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(200).optional(),
  })
  .refine(
    (v) => !v.newPassword || (v.currentPassword && v.currentPassword.length > 0),
    { message: 'Current password is required to change password', path: ['currentPassword'] },
  );

export async function GET() {
  try {
    const session = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(user);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireUser();
    const data = patchSchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let passwordHash: string | undefined;
    if (data.newPassword) {
      const ok = await bcrypt.compare(data.currentPassword!, user.passwordHash);
      if (!ok) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
      passwordHash = await bcrypt.hash(data.newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name: data.name, passwordHash },
      select: { id: true, email: true, name: true, role: true },
    });

    if (data.name && data.name !== user.name) {
      const session2 = await getSession();
      session2.name = updated.name;
      await session2.save();
    }

    return NextResponse.json({ ok: true, user: updated });
  } catch (e) {
    return handleError(e);
  }
}
