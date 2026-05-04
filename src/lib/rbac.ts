import type { Role } from './auth';
import { prisma } from './prisma';

// Role hierarchy: ADMIN > MANAGER > CONTRIBUTOR > VIEWER
const RANK: Record<Role, number> = { ADMIN: 4, MANAGER: 3, CONTRIBUTOR: 2, VIEWER: 1 };

export function atLeast(actual: Role, required: Role) {
  return RANK[actual] >= RANK[required];
}

export function isAdmin(role?: Role | string | null) {
  return role === 'ADMIN';
}

/**
 * Returns whether a user can view a project. Admins always can.
 * Managers can view projects they manage. Members can view their own projects.
 * Viewers can only see ACTIVE projects they are members of.
 */
export async function canViewProject(userId: string, role: Role, projectId: string) {
  if (role === 'ADMIN') return true;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { userId } } },
  });
  if (!project) return false;
  if (project.managerId === userId) return true;
  if (project.members.length > 0) {
    if (role === 'VIEWER' && project.status !== 'ACTIVE') return false;
    return true;
  }
  return false;
}

/** Determines whether a user can edit a project's content (phases, features). */
export async function canEditProject(userId: string, role: Role, projectId: string) {
  if (role === 'ADMIN') return true;
  if (role === 'VIEWER') return false;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { userId } } },
  });
  if (!project) return false;
  if (role === 'MANAGER' && project.managerId === userId) return true;
  // Contributors can edit features they own; phase/project structural edits are manager+ only
  return false;
}

export async function canEditFeature(userId: string, role: Role, featureId: string) {
  if (role === 'ADMIN') return true;
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
    include: { phase: { include: { project: true } } },
  });
  if (!feature) return false;
  const project = feature.phase.project;
  if (role === 'MANAGER' && project.managerId === userId) return true;
  if (role === 'CONTRIBUTOR' && feature.assigneeId === userId) return true;
  return false;
}
