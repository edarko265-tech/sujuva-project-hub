import Link from 'next/link';
import { Logo } from './Logo';
import { LiveNotifications } from './LiveNotifications';
import type { Role } from '@/lib/auth';

interface Props { role: Role; name: string }

const links: Array<{ href: string; label: string; min: Role[] }> = [
  { href: '/dashboard', label: 'Overview', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'] },
  { href: '/projects', label: 'Projects', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'] },
  { href: '/insights', label: 'Insights', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR'] },
  { href: '/brain-dump', label: 'Brain Dump', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR'] },
  { href: '/chatbot', label: 'Assistant', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'] },
  { href: '/admin/users', label: 'Users', min: ['ADMIN'] },
  { href: '/admin/phase-templates', label: 'Phases', min: ['ADMIN'] },
  { href: '/admin/settings', label: 'Settings', min: ['ADMIN'] },
];

export function Nav({ role, name }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Logo />
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {links.filter((l) => l.min.includes(role)).map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-brand-cream hover:text-brand-navy">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <LiveNotifications />
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-brand-ink">{name}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{role}</div>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="btn-ghost">Sign out</button>
          </form>
        </div>
      </div>
      <nav className="md:hidden border-t border-slate-100 px-2 py-1 flex flex-wrap gap-1">
        {links.filter((l) => l.min.includes(role)).map((l) => (
          <Link key={l.href} href={l.href} className="rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-brand-cream">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
