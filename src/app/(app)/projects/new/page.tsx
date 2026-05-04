import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { NewProjectForm } from './new-project-form';

export default async function NewProjectPage() {
  const session = await getSession();
  if (!['ADMIN', 'MANAGER'].includes(session.role!)) redirect('/projects');
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold text-brand-ink">New project</h1>
      <NewProjectForm />
    </div>
  );
}
