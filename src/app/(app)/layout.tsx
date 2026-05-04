import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/auth';
import { Nav } from '@/components/Nav';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.userId) redirect('/login');
  return (
    <div>
      <Nav role={session.role!} name={session.name ?? session.email ?? 'User'} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
