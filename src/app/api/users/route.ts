import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleError } from '../projects/route';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'MANAGER']);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    return NextResponse.json(users);
  } catch (e) { return handleError(e); }
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']),
});

export async function POST(req: Request) {
  try {
    await requireRole(['ADMIN']);
    const data = createSchema.parse(await req.json());
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) { return handleError(e); }
}
