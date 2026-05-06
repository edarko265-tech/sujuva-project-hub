import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { Logo } from './Logo';
import { LiveNotifications } from './LiveNotifications';
import { ThemeToggle } from './ThemeToggle';
import {
  IconHome, IconFolder, IconChart, IconBrain, IconChat,
  IconUsers, IconLayers, IconSettings,
} from './icons';
import type { Role } from '@/lib/auth';

interface Props { role: Role; name: string }

type IconCmp = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
const links: Array<{ href: string; label: string; min: Role[]; Icon: IconCmp }> = [
  { href: '/dashboard', label: 'Overview', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'], Icon: IconHome },
  { href: '/projects', label: 'Projects', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'], Icon: IconFolder },
  { href: '/insights', label: 'Insights', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR'], Icon: IconChart },
  { href: '/brain-dump', label: 'Brain Dump', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR'], Icon: IconBrain },
  { href: '/chatbot', label: 'Assistant', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'], Icon: IconChat },
  { href: '/admin/users', label: 'Users', min: ['ADMIN'], Icon: IconUsers },
  { href: '/admin/phase-templates', label: 'Phases', min: ['ADMIN'], Icon: IconLayers },
  { href: '/admin/settings', label: 'Settings', min: ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'], Icon: IconSettings },
];

export function Nav({ role, name }: Props) {
  const visible = links.filter((l) => l.min.includes(role));
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5">
        <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
          <Logo />
        </Link>
        <nav className="hidden md:flex items-center gap-0.5">
          {visible.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium tracking-tight text-slate-600 transition-colors hover:bg-brand-cream hover:text-brand-navy dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-brand-gold"
            >
              <l.Icon size={15} className="text-slate-400 group-hover:text-brand-navy dark:text-slate-500 dark:group-hover:text-brand-gold" />
              <span>{l.label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LiveNotifications />
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy text-[10px] font-bold uppercase text-white dark:bg-brand-gold dark:text-brand-ink">
              {initials(name)}
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold text-brand-ink dark:text-slate-100">{name}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{role}</div>
            </div>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="btn-ghost text-xs">Sign out</button>
          </form>
        </div>
      </div>
      <nav className="md:hidden border-t border-slate-100 px-2 py-1 flex flex-wrap gap-0.5 dark:border-slate-800">
        {visible.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-brand-cream dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <l.Icon size={13} />
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
