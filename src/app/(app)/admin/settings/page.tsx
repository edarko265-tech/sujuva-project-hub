import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAllowedEmailDomains } from '@/lib/emailDomains';
import { SettingsClient, type SettingsData } from './settings-client';
import pkg from '../../../../../package.json';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session.userId) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true, active: true },
  });
  if (!me) redirect('/login');

  const isAdmin = me.role === 'ADMIN';

  const data: SettingsData = {
    me: { ...me, createdAt: me.createdAt.toISOString() },
    workspace: {
      appName: 'Sujuva Project Hub',
      domain:
        process.env.PUBLIC_DOMAIN ||
        (process.env.TELEGRAM_WEBHOOK_URL ? new URL(process.env.TELEGRAM_WEBHOOK_URL).host : null),
      nodeEnv: process.env.NODE_ENV || 'development',
      nodeVersion: process.version.replace(/^v/, ''),
      appVersion: (pkg as { version?: string }).version ?? '0.0.0',
    },
    security: {
      allowedEmailDomains: getAllowedEmailDomains(),
      allowLocalInDev: process.env.NODE_ENV !== 'production',
      sessionSecretSet: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
    },
    integrations: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      telegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      telegramWebhook: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      sse: process.env.ACTIVITY_STREAM_ENABLED !== 'false',
      streamMaxClients: Number(process.env.ACTIVITY_STREAM_MAX_CLIENTS) || 200,
    },
    system: {
      database: maskDatabaseUrl(process.env.DATABASE_URL || 'file:./prisma/prod.db'),
      databaseProvider: detectProvider(process.env.DATABASE_URL),
      uploadsDriver: process.env.UPLOADS_DRIVER || 'local (./uploads)',
    },
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold text-brand-ink dark:text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your profile{isAdmin ? ', workspace policy and integrations' : ''}.
        </p>
      </header>
      <SettingsClient data={data} isAdmin={isAdmin} />
    </div>
  );
}

function detectProvider(url?: string): string {
  if (!url) return 'SQLite';
  if (url.startsWith('postgres')) return 'PostgreSQL';
  if (url.startsWith('mysql')) return 'MySQL';
  if (url.startsWith('file:')) return 'SQLite';
  return 'Unknown';
}

function maskDatabaseUrl(url: string): string {
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1***$3');
}
