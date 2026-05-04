import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { BrainDumpClient } from './brain-dump-client';

export default async function BrainDumpPage() {
  const session = await getSession();
  if (session.role === 'VIEWER') redirect('/dashboard');
  const where = session.role === 'ADMIN' ? {} : {
    OR: [{ managerId: session.userId }, { members: { some: { userId: session.userId } } }],
  };
  const projects = await prisma.project.findMany({
    where,
    select: { id: true, name: true, phases: { select: { id: true, name: true, order: true }, orderBy: { order: 'asc' } } },
  });
  const dumps = await prisma.brainDump.findMany({
    where: session.role === 'ADMIN' ? {} : { authorId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { project: true },
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-brand-ink">Brain Dump</h1>
      <BrainDumpClient projects={projects} dumps={JSON.parse(JSON.stringify(dumps))} />
    </div>
  );
}
