/**
 * Seed / restore the default global PhaseTemplate records.
 *
 * Idempotent:
 *   - Inserts any phase from DEFAULT_PHASES that doesn't already exist (matched by name).
 *   - Updates `order` and `required` on existing defaults so positions stay correct.
 *   - Leaves any custom phases the admin added (with names not in this list) untouched.
 *
 * Run locally:    npx tsx scripts/seed-global-phases.ts
 * Run on server:  sudo -u sujuva npx tsx scripts/seed-global-phases.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PHASES: Array<{ name: string; required?: boolean }> = [
  { name: 'Approval' },
  { name: 'Foundation' },
  { name: 'Intake & Validation' },
  { name: 'Workflow Engine' },
  { name: 'Worker Execution' },
  { name: 'Priority + EV Logic' },
  { name: 'Real-time + Notifications' },
  { name: 'Dashboard + Portal' },
  { name: 'Reporting + AI' },
  { name: 'Deployment' },
  { name: 'Completion', required: false },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (let i = 0; i < DEFAULT_PHASES.length; i++) {
    const { name, required = true } = DEFAULT_PHASES[i];
    const existing = await prisma.phaseTemplate.findFirst({ where: { name } });

    if (existing) {
      await prisma.phaseTemplate.update({
        where: { id: existing.id },
        data: { order: i, required },
      });
      updated++;
    } else {
      await prisma.phaseTemplate.create({
        data: { name, order: i, required },
      });
      created++;
    }
  }

  const total = await prisma.phaseTemplate.count();
  console.log(`✔ Global phases seeded — created: ${created}, updated: ${updated}, total in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
