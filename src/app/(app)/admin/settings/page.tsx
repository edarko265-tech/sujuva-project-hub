import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function SettingsPage() {
  const session = await getSession();
  if (session.role !== 'ADMIN') redirect('/dashboard');
  const integrationState = {
    openai: Boolean(process.env.OPENAI_API_KEY),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramWebhook: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    stream: process.env.ACTIVITY_STREAM_ENABLED !== 'false',
  };

  const Badge = ({ ok, yes = 'Configured', no = 'Missing' }: { ok: boolean; yes?: string; no?: string }) => (
    <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>{ok ? yes : no}</span>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold text-brand-ink">App settings</h1>
      <div className="card p-4 space-y-2 text-sm">
        <div className="font-semibold">Roles & permissions</div>
        <p className="text-slate-600">Roles are fixed in this MVP: <b>ADMIN</b>, <b>MANAGER</b>, <b>CONTRIBUTOR</b>, <b>VIEWER</b>.</p>
        <p className="text-slate-600">Manage global users and per-project role assignment in <a className="text-brand-navy underline" href="/admin/users">Users</a>.</p>
      </div>
      <div className="card p-4 space-y-2 text-sm">
        <div className="font-semibold">AI / ChatGPT</div>
        <div><Badge ok={integrationState.openai} yes="OPENAI_API_KEY set" no="OPENAI_API_KEY missing" /></div>
        <p className="text-slate-600">Set <code>OPENAI_API_KEY</code> in your environment to enable real assistant responses. Without it, the assistant runs in mock mode.</p>
        <p className="text-slate-600">Model is configured by <code>OPENAI_MODEL</code> (default <code>gpt-4o-mini</code>).</p>
      </div>
      <div className="card p-4 space-y-2 text-sm">
        <div className="font-semibold">Telegram bot</div>
        <div className="flex flex-wrap gap-2">
          <Badge ok={integrationState.telegram} yes="Bot token set" no="Bot token missing" />
          <Badge ok={integrationState.telegramWebhook} yes="Webhook secret set" no="Webhook secret missing" />
        </div>
        <p className="text-slate-600">Set <code>TELEGRAM_BOT_TOKEN</code> (BotFather), <code>TELEGRAM_WEBHOOK_URL</code> (public HTTPS origin of this app) and a random <code>TELEGRAM_WEBHOOK_SECRET</code> in your environment. Then call <code>https://api.telegram.org/bot&lt;token&gt;/setWebhook?url=&lt;TELEGRAM_WEBHOOK_URL&gt;/api/integrations/telegram/&lt;TELEGRAM_WEBHOOK_SECRET&gt;</code> once. Incoming updates are routed through <code>src/lib/messageRouter.ts</code> to the AI assistant.</p>
      </div>
      <div className="card p-4 space-y-2 text-sm">
        <div className="font-semibold">Live activity stream</div>
        <div><Badge ok={integrationState.stream} yes="SSE enabled" no="SSE disabled" /></div>
        <p className="text-slate-600">Live notifications use <code>/api/stream</code> (SSE). Tune capacity with <code>ACTIVITY_STREAM_MAX_CLIENTS</code>.</p>
      </div>
      <div className="card p-4 space-y-2 text-sm">
        <div className="font-semibold">Database</div>
        <p className="text-slate-600">Default is SQLite (<code>file:./dev.db</code>). To switch to PostgreSQL, change the provider in <code>prisma/schema.prisma</code> and update <code>DATABASE_URL</code>.</p>
      </div>
    </div>
  );
}
