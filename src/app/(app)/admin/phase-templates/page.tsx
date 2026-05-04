import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PhaseTemplatesClient } from './phase-templates-client';

export default async function PhaseTemplatesPage() {
  const session = await getSession();
  if (session.role !== 'ADMIN') redirect('/dashboard');
  const templates = await prisma.phaseTemplate.findMany({ orderBy: { order: 'asc' } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand-ink">Global phase templates</h1>
      <p className="text-sm text-slate-500">These phases are applied when a new project is created with “use template”.</p>
      <PhaseTemplatesClient initial={templates.map((t) => ({ id: t.id, name: t.name, order: t.order, required: t.required }))} />
    </div>
  );
}
