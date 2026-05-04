import { prisma } from './prisma';

/**
 * Completion calculation rules (MVP):
 *  - Feature completion = stored 0..100 (forced to 100 if status COMPLETED, 0 if NOT_STARTED w/o value)
 *  - Phase completion = weighted average of its features' completion
 *  - Project completion = weighted average of its phases' completion
 */
export function effectiveFeatureCompletion(status: string, completion: number) {
  if (status === 'COMPLETED') return 100;
  if (status === 'NOT_STARTED' && !completion) return 0;
  return Math.max(0, Math.min(100, completion));
}

export function phaseCompletion(features: Array<{ status: string; completion: number; weight: number }>) {
  if (features.length === 0) return 0;
  const totalW = features.reduce((s, f) => s + (f.weight || 1), 0);
  const weighted = features.reduce(
    (s, f) => s + effectiveFeatureCompletion(f.status, f.completion) * (f.weight || 1),
    0,
  );
  return Math.round(weighted / Math.max(totalW, 1));
}

export function projectCompletion(
  phases: Array<{ weight: number; features: Array<{ status: string; completion: number; weight: number }> }>,
) {
  const phasesWithFeatures = phases.filter((p) => p.features.length > 0);
  if (phasesWithFeatures.length === 0) return 0;
  const totalW = phasesWithFeatures.reduce((s, p) => s + (p.weight || 1), 0);
  const weighted = phasesWithFeatures.reduce(
    (s, p) => s + phaseCompletion(p.features) * (p.weight || 1),
    0,
  );
  return Math.round(weighted / Math.max(totalW, 1));
}

export function currentPhaseName(
  phases: Array<{ name: string; order: number; features: Array<{ status: string; completion: number; weight: number }> }>,
) {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  for (const p of sorted) {
    if (phaseCompletion(p.features) < 100) return p.name;
  }
  return sorted[sorted.length - 1]?.name ?? 'Not started';
}

export async function getProjectWithProgress(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      manager: true,
      members: { include: { user: true } },
      phases: {
        orderBy: { order: 'asc' },
        include: { features: { include: { assignee: true } } },
      },
    },
  });
  if (!project) return null;
  const completion = projectCompletion(project.phases);
  const current = currentPhaseName(project.phases);
  return { ...project, completion, currentPhase: current };
}
