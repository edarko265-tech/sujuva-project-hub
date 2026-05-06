import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const isProd = process.env.NODE_ENV === 'production';
  // Production deployments default to the real system admin; local/dev keeps
  // the legacy seed admin unless overridden.
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ?? (isProd ? 'eric.darko@sujuva.pro' : 'admin@sujuva.local');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const adminName = process.env.SEED_ADMIN_NAME ?? (isProd ? 'Eric Darko' : 'Hub Admin');
  // Skip the demo .local users in production (or whenever SEED_DEMO_USERS=false).
  const includeDemo = (process.env.SEED_DEMO_USERS ?? (isProd ? 'false' : 'true')) !== 'false';

  // Users
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: 'ADMIN',
    },
  });

  if (!includeDemo) {
    console.log(`Seeded production admin: ${adminEmail}. Skipping demo users + sample project.`);
    return;
  }

  const manager = await prisma.user.upsert({
    where: { email: 'manager@sujuva.local' },
    update: {},
    create: {
      email: 'manager@sujuva.local',
      name: 'Project Manager',
      passwordHash: await bcrypt.hash('manager123', 10),
      role: 'MANAGER',
    },
  });

  const contributor = await prisma.user.upsert({
    where: { email: 'dev@sujuva.local' },
    update: {},
    create: {
      email: 'dev@sujuva.local',
      name: 'Eric Developer',
      passwordHash: await bcrypt.hash('dev123', 10),
      role: 'CONTRIBUTOR',
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'stakeholder@sujuva.local' },
    update: {},
    create: {
      email: 'stakeholder@sujuva.local',
      name: 'Stakeholder',
      passwordHash: await bcrypt.hash('view123', 10),
      role: 'VIEWER',
    },
  });

  // Phase templates
  const phaseNames = [
    'Approval', 'Foundation', 'Intake & Validation', 'Workflow Engine',
    'Worker Execution', 'Priority + EV Logic', 'Real-time + Notifications',
    'Dashboard + Portal', 'Reporting + AI', 'Deployment', 'Completion',
  ];
  await prisma.phaseTemplate.deleteMany();
  await prisma.phaseTemplate.createMany({
    data: phaseNames.map((name, i) => ({ name, order: i, required: i !== phaseNames.length - 1 })),
  });

  // Sample VRKH project
  const existing = await prisma.project.findFirst({ where: { name: { contains: 'VRKH' } } });
  if (existing) {
    console.log('VRKH project already seeded.');
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: 'VRKH / Tiedolla Depot Operations Platform',
      description: 'Replacing Hailer with a smart depot operations platform for Sujuva.',
      managerId: manager.id,
      members: {
        create: [
          { userId: admin.id, roleInProject: 'ADMIN' },
          { userId: manager.id, roleInProject: 'MANAGER' },
          { userId: contributor.id, roleInProject: 'CONTRIBUTOR' },
          { userId: viewer.id, roleInProject: 'VIEWER' },
        ],
      },
      phases: {
        create: phaseNames.map((name, i) => ({
          name, order: i, required: i !== phaseNames.length - 1,
        })),
      },
    },
    include: { phases: true },
  });

  // Seed sample features per phase
  const samples: Record<string, Array<{ title: string; description?: string; status?: string; completion?: number; priority?: string; assigneeEmail?: string }>> = {
    'Approval': [
      { title: 'Stakeholder kick-off & scope sign-off', status: 'COMPLETED', completion: 100, priority: 'HIGH', assigneeEmail: manager.email },
      { title: 'Budget & timeline approval', status: 'COMPLETED', completion: 100, priority: 'HIGH', assigneeEmail: manager.email },
    ],
    'Foundation': [
      { title: 'Tech stack & repository setup', status: 'COMPLETED', completion: 100, priority: 'HIGH', assigneeEmail: contributor.email },
      { title: 'Auth, RBAC, base UI shell', status: 'IN_PROGRESS', completion: 60, priority: 'HIGH', assigneeEmail: contributor.email },
    ],
    'Intake & Validation': [
      { title: 'Vehicle intake form (license plate, condition photos)', status: 'IN_PROGRESS', completion: 40, priority: 'HIGH', assigneeEmail: contributor.email },
      { title: 'Validation rules engine', status: 'NOT_STARTED', completion: 0, priority: 'MEDIUM' },
    ],
    'Workflow Engine': [
      { title: 'Configurable workflow definitions', status: 'NOT_STARTED', completion: 0, priority: 'HIGH' },
      { title: 'State transitions + audit log', status: 'NOT_STARTED', completion: 0, priority: 'HIGH' },
    ],
    'Worker Execution': [
      { title: 'Worker mobile worklist UI', status: 'NOT_STARTED', completion: 0, priority: 'HIGH' },
      { title: 'Task pickup, complete, hand-off', status: 'NOT_STARTED', completion: 0, priority: 'MEDIUM' },
    ],
    'Priority + EV Logic': [
      { title: 'Dynamic prioritisation rules', status: 'NOT_STARTED', completion: 0, priority: 'MEDIUM' },
      { title: 'EV charging slot assignment', status: 'BLOCKED', completion: 10, priority: 'HIGH', assigneeEmail: contributor.email },
    ],
    'Real-time + Notifications': [
      { title: 'WebSocket / SSE event channel', status: 'NOT_STARTED', completion: 0, priority: 'MEDIUM' },
      { title: 'Push / Telegram / WhatsApp notifications', status: 'NOT_STARTED', completion: 0, priority: 'LOW' },
    ],
    'Dashboard + Portal': [
      { title: 'Operations dashboard', status: 'NOT_STARTED', completion: 0, priority: 'MEDIUM' },
      { title: 'Customer portal MVP', status: 'NOT_STARTED', completion: 0, priority: 'LOW' },
    ],
    'Reporting + AI': [
      { title: 'KPI reports', status: 'NOT_STARTED', completion: 0, priority: 'LOW' },
      { title: 'AI assistant for ops queries', status: 'NOT_STARTED', completion: 0, priority: 'LOW' },
    ],
    'Deployment': [
      { title: 'Docker + CI/CD pipeline', status: 'NOT_STARTED', completion: 0, priority: 'MEDIUM' },
      { title: 'Pilot rollout at Klovi depot', status: 'NOT_STARTED', completion: 0, priority: 'HIGH' },
    ],
    'Completion': [
      { title: 'Hand-over & training', status: 'NOT_STARTED', completion: 0, priority: 'MEDIUM' },
    ],
  };

  for (const phase of project.phases) {
    const items = samples[phase.name] ?? [];
    for (const f of items) {
      const assignee = f.assigneeEmail
        ? await prisma.user.findUnique({ where: { email: f.assigneeEmail } })
        : null;
      await prisma.feature.create({
        data: {
          phaseId: phase.id,
          title: f.title,
          description: f.description,
          status: f.status ?? 'NOT_STARTED',
          priority: f.priority ?? 'MEDIUM',
          completion: f.completion ?? 0,
          assigneeId: assignee?.id,
        },
      });
    }
  }

  await prisma.activity.create({
    data: {
      projectId: project.id,
      actorId: admin.id,
      type: 'CREATE',
      message: 'Project seeded with VRKH / Tiedolla phases and sample features.',
    },
  });

  console.log('Seed complete. Login as', adminEmail, '/', adminPassword);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
