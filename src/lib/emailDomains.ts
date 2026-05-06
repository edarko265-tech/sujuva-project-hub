/**
 * Centralised allow-list for user email domains.
 *
 * Production deployments should only accept users from approved company
 * domains. The list is configured via the `ALLOWED_EMAIL_DOMAINS` env var
 * (comma-separated). When that var is unset the defaults below apply.
 *
 * In non-production environments (`NODE_ENV !== 'production'`) we also
 * permit the legacy `*.local` seed addresses so local dev/seed data keeps
 * working without surprises.
 */

const DEFAULT_DOMAINS = ['sujuva.pro', 'all-rounders.fi'];

function parse(envValue: string | undefined): string[] {
  if (!envValue) return DEFAULT_DOMAINS;
  return envValue
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedEmailDomains(): string[] {
  return parse(process.env.ALLOWED_EMAIL_DOMAINS);
}

export interface EmailValidationOptions {
  /**
   * Allow the legacy `*.local` seed addresses. Defaults to true outside
   * production so local dev and demo data continue to work.
   */
  allowLocal?: boolean;
}

export function isAllowedEmail(email: string, opts: EmailValidationOptions = {}): boolean {
  const allowLocal = opts.allowLocal ?? process.env.NODE_ENV !== 'production';
  const lower = email.toLowerCase().trim();
  const at = lower.lastIndexOf('@');
  if (at < 1) return false;
  const domain = lower.slice(at + 1);
  if (!domain) return false;
  if (allowLocal && domain.endsWith('.local')) return true;
  return getAllowedEmailDomains().includes(domain);
}

export function emailDomainErrorMessage(): string {
  const list = getAllowedEmailDomains().join(', ');
  return `Email must be from an approved company domain (${list}).`;
}
