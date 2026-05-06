import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UsersClient } from './users-client';

export default async function UsersPage() {
  const session = await getSession();
  if (session.role !== 'ADMIN') redirect('/dashboard');
  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        memberships: { select: { projectId: true, roleInProject: true } },
      },
    }),
    prisma.project.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand-ink">Users</h1>
      <UsersClient users={users} projects={projects} />
    </div>
  );
}
