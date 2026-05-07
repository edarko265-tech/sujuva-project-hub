'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconUser, IconBuilding, IconShield, IconPlug, IconServer,
  IconCheck, IconAlert, IconCopy, IconKey,
} from '@/components/icons';
import { PasswordInput } from '@/components/PasswordInput';

export interface SettingsData {
  me: { id: string; email: string; name: string; role: string; createdAt: string };
  workspace: {
    appName: string;
    domain: string | null;
    nodeEnv: string;
    nodeVersion: string;
    appVersion: string;
  };
  security: {
    allowedEmailDomains: string[];
    allowLocalInDev: boolean;
    sessionSecretSet: boolean;
  };
  integrations: {
    openai: boolean;
    openaiModel: string;
    telegramToken: boolean;
    telegramWebhook: boolean;
    sse: boolean;
    streamMaxClients: number;
  };
  system: {
    database: string;
    databaseProvider: string;
    uploadsDriver: string;
  };
}

type TabId = 'profile' | 'workspace' | 'security' | 'integrations' | 'system';

const TABS: Array<{ id: TabId; label: string; Icon: typeof IconUser; adminOnly?: boolean }> = [
  { id: 'profile', label: 'Profile', Icon: IconUser },
  { id: 'workspace', label: 'Workspace', Icon: IconBuilding, adminOnly: true },
  { id: 'security', label: 'Security & Access', Icon: IconShield, adminOnly: true },
  { id: 'integrations', label: 'Integrations', Icon: IconPlug, adminOnly: true },
  { id: 'system', label: 'System', Icon: IconServer, adminOnly: true },
];

export function SettingsClient({ data, isAdmin }: { data: SettingsData; isAdmin: boolean }) {
  const [tab, setTab] = useState<TabId>('profile');
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      {/* Sidebar */}
      <aside className="card p-2 h-max sticky top-20">
        <nav className="flex flex-col gap-0.5">
          {visibleTabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-brand-navy text-white shadow-sm dark:bg-brand-gold dark:text-brand-ink'
                    : 'text-slate-700 hover:bg-brand-cream dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <t.Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <section className="space-y-4">
        {tab === 'profile' && <ProfileTab me={data.me} />}
        {tab === 'workspace' && <WorkspaceTab data={data.workspace} />}
        {tab === 'security' && <SecurityTab data={data.security} />}
        {tab === 'integrations' && <IntegrationsTab data={data.integrations} />}
        {tab === 'system' && <SystemTab data={data.system} />}
      </section>
    </div>
  );
}

/* ----------------------------- Reusable bits ----------------------------- */

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-brand-ink dark:text-slate-100">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  );
}

function StatusPill({ ok, yes = 'Active', no = 'Not configured' }: { ok: boolean; yes?: string; no?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        ok
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900'
          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900'
      }`}
    >
      {ok ? <IconCheck size={12} /> : <IconAlert size={12} />}
      {ok ? yes : no}
    </span>
  );
}

function FieldRow({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-3 first:pt-0 last:pb-0 border-b border-slate-100 last:border-b-0 sm:grid-cols-[180px_1fr] sm:items-start dark:border-slate-800">
      <div>
        <div className="text-sm font-medium text-brand-ink dark:text-slate-200">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CopyKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      title="Click to copy"
    >
      <span>{value}</span>
      <IconCopy size={12} className={copied ? 'text-emerald-500' : ''} />
    </button>
  );
}

/* ------------------------------- Profile -------------------------------- */

function ProfileTab({ me }: { me: SettingsData['me'] }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function saveProfile() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ kind: 'ok', text: 'Profile updated.' });
      router.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' });
    } finally { setBusy(false); }
  }

  async function changePassword() {
    setMsg(null);
    if (newPassword !== newPassword2) { setMsg({ kind: 'err', text: 'New passwords do not match.' }); return; }
    if (newPassword.length < 8) { setMsg({ kind: 'err', text: 'Password must be at least 8 characters.' }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed');
      }
      setCurrentPassword(''); setNewPassword(''); setNewPassword2('');
      setMsg({ kind: 'ok', text: 'Password changed successfully.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' });
    } finally { setBusy(false); }
  }

  return (
    <>
      <SectionHeader title="Profile" description="Your account details and personal credentials." />

      <div className="card p-5">
        <FieldRow label="Email" hint="Contact your admin to change your email.">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700 dark:text-slate-300">{me.email}</span>
            <span className="badge badge-blue">{me.role}</span>
          </div>
        </FieldRow>
        <FieldRow label="Display name">
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-sm" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-primary" onClick={saveProfile} disabled={busy || name === me.name || !name.trim()}>
              Save name
            </button>
          </div>
        </FieldRow>
        <FieldRow label="Member since">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {new Date(me.createdAt).toISOString().slice(0, 10)}
          </span>
        </FieldRow>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <IconKey size={18} className="text-brand-navy dark:text-brand-gold" />
          <h3 className="text-base font-semibold text-brand-ink dark:text-slate-100">Change password</h3>
        </div>
        <div className="grid gap-3 max-w-md">
          <div>
            <label className="label">Current password</label>
            <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your current password" />
          </div>
          <div>
            <label className="label">New password</label>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use at least 8 characters with a mix of letters, numbers and symbols.</p>
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <PasswordInput value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} autoComplete="new-password" placeholder="Re-enter the new password" />
          </div>
          <div>
            <button className="btn-primary" onClick={changePassword} disabled={busy || !currentPassword || !newPassword}>
              Update password
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`rounded-md px-3 py-2 text-sm ${
          msg.kind === 'ok'
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900'
            : 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900'
        }`}>{msg.text}</div>
      )}
    </>
  );
}

/* ------------------------------ Workspace ------------------------------- */

function WorkspaceTab({ data }: { data: SettingsData['workspace'] }) {
  return (
    <>
      <SectionHeader title="Workspace" description="High-level information about this Project Hub deployment." />
      <div className="card p-5">
        <FieldRow label="Name">
          <span className="text-sm font-semibold text-brand-ink dark:text-slate-100">{data.appName}</span>
        </FieldRow>
        <FieldRow label="Public URL">
          {data.domain ? (
            <a href={`https://${data.domain}`} target="_blank" rel="noreferrer" className="text-sm text-brand-navy underline dark:text-brand-gold">
              https://{data.domain}
            </a>
          ) : (
            <span className="text-sm text-slate-500">Not configured</span>
          )}
        </FieldRow>
        <FieldRow label="Environment">
          <span className={`badge ${data.nodeEnv === 'production' ? 'badge-green' : 'badge-amber'}`}>{data.nodeEnv}</span>
        </FieldRow>
        <FieldRow label="Runtime">
          <span className="text-sm text-slate-600 dark:text-slate-400">Node.js {data.nodeVersion}</span>
        </FieldRow>
        <FieldRow label="App version">
          <span className="text-sm text-slate-600 dark:text-slate-400">v{data.appVersion}</span>
        </FieldRow>
      </div>
    </>
  );
}

/* ------------------------------- Security ------------------------------- */

function SecurityTab({ data }: { data: SettingsData['security'] }) {
  return (
    <>
      <SectionHeader title="Security & Access" description="Authentication policy and role configuration." />

      <div className="card p-5">
        <FieldRow label="Session secret" hint="Used to sign auth cookies. Set ≥ 32 random chars in production.">
          <StatusPill ok={data.sessionSecretSet} yes="Set (32+ chars)" no="Default — change immediately" />
        </FieldRow>
        <FieldRow label="Approved email domains" hint="Only these domains can be added as users.">
          <div className="flex flex-wrap gap-1.5">
            {data.allowedEmailDomains.map((d) => (
              <span key={d} className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                @{d}
              </span>
            ))}
            {data.allowLocalInDev && (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                @*.local (dev only)
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Configure with <CopyKey value="ALLOWED_EMAIL_DOMAINS" /> in <code>.env</code>.
          </p>
        </FieldRow>
        <FieldRow label="Roles">
          <div className="flex flex-wrap gap-1.5">
            <span className="badge badge-violet">ADMIN</span>
            <span className="badge badge-blue">MANAGER</span>
            <span className="badge badge-green">CONTRIBUTOR</span>
            <span className="badge badge-gray">VIEWER</span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Manage assignments in <a href="/admin/users" className="text-brand-navy underline dark:text-brand-gold">Users</a>.
          </p>
        </FieldRow>
      </div>
    </>
  );
}

/* ----------------------------- Integrations ----------------------------- */

function IntegrationsTab({ data }: { data: SettingsData['integrations'] }) {
  return (
    <>
      <SectionHeader title="Integrations" description="External services connected to this workspace." />

      <IntegrationCard
        title="AI assistant"
        subtitle="Powers the assistant, brain-dump refinement and voice transcription."
        ok={data.openai}
        okLabel="Connected"
        notOkLabel="Not configured"
      >
        <FieldRow label="Status">
          <StatusPill ok={data.openai} yes="API key set" no="No API key" />
        </FieldRow>
        <FieldRow label="Model">
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{data.openaiModel}</code>
        </FieldRow>
      </IntegrationCard>

      <IntegrationCard
        title="Telegram bot"
        subtitle="Optional. Lets users brain-dump or chat via Telegram."
        ok={data.telegramToken && data.telegramWebhook}
        okLabel="Configured"
        notOkLabel="Incomplete"
      >
        <FieldRow label="Bot token">
          <StatusPill ok={data.telegramToken} yes="Set" no="Missing" />
          <span className="ml-2"><CopyKey value="TELEGRAM_BOT_TOKEN" /></span>
        </FieldRow>
        <FieldRow label="Webhook secret">
          <StatusPill ok={data.telegramWebhook} yes="Set" no="Missing" />
          <span className="ml-2"><CopyKey value="TELEGRAM_WEBHOOK_SECRET" /></span>
        </FieldRow>
        <FieldRow label="Setup">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Get a token from <a className="text-brand-navy underline dark:text-brand-gold" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, set the env vars above, then call:<br />
            <code className="mt-1 inline-block break-all rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">https://api.telegram.org/bot&lt;token&gt;/setWebhook?url=&lt;public_url&gt;/api/integrations/telegram/&lt;secret&gt;</code>
          </p>
        </FieldRow>
      </IntegrationCard>

      <IntegrationCard
        title="Live activity stream"
        subtitle="Real-time notifications via Server-Sent Events."
        ok={data.sse}
        okLabel="Enabled"
        notOkLabel="Disabled"
      >
        <FieldRow label="Endpoint">
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">/api/stream</code>
        </FieldRow>
        <FieldRow label="Max concurrent clients">
          <span className="text-sm text-slate-600 dark:text-slate-400">{data.streamMaxClients}</span>
          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">Tune with <CopyKey value="ACTIVITY_STREAM_MAX_CLIENTS" /></span>
        </FieldRow>
      </IntegrationCard>
    </>
  );
}

function IntegrationCard({
  title, subtitle, ok, okLabel, notOkLabel, children,
}: {
  title: string; subtitle: string; ok: boolean; okLabel: string; notOkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold text-brand-ink dark:text-slate-100">{title}</h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <StatusPill ok={ok} yes={okLabel} no={notOkLabel} />
      </div>
      <div>{children}</div>
    </div>
  );
}

/* -------------------------------- System -------------------------------- */

function SystemTab({ data }: { data: SettingsData['system'] }) {
  return (
    <>
      <SectionHeader title="System" description="Infrastructure and storage configuration." />
      <div className="card p-5">
        <FieldRow label="Database provider">
          <span className="badge badge-blue">{data.databaseProvider}</span>
        </FieldRow>
        <FieldRow label="Database URL" hint="Defined by DATABASE_URL.">
          <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{data.database}</code>
        </FieldRow>
        <FieldRow label="File attachments">
          <span className="text-sm text-slate-600 dark:text-slate-400">{data.uploadsDriver}</span>
        </FieldRow>
        <FieldRow label="Migrations">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Apply with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">npx prisma migrate deploy</code>
          </span>
        </FieldRow>
      </div>

      <div className="card p-5">
        <h3 className="text-base font-semibold text-brand-ink dark:text-slate-100 mb-1">Operations</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Runbook commands for the server administrator.</p>
        <div className="grid gap-2 text-xs font-mono">
          <CmdRow desc="Restart application" cmd="sudo systemctl restart sujuva" />
          <CmdRow desc="Tail live logs" cmd="sudo journalctl -u sujuva -f" />
          <CmdRow desc="Reload Caddy" cmd="sudo systemctl reload caddy" />
          <CmdRow desc="Backup database" cmd="sudo /etc/cron.daily/sujuva-backup" />
        </div>
      </div>
    </>
  );
}

function CmdRow({ desc, cmd }: { desc: string; cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 not-italic font-sans">{desc}</div>
        <div className="text-slate-800 dark:text-slate-100">{cmd}</div>
      </div>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        className="rounded p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
        title="Copy"
      >
        <IconCopy size={14} className={copied ? 'text-emerald-500' : ''} />
      </button>
    </div>
  );
}
