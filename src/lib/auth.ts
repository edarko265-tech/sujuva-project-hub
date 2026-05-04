import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export type Role = 'ADMIN' | 'MANAGER' | 'CONTRIBUTOR' | 'VIEWER';

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  role?: Role;
}

const SECRET = process.env.SESSION_SECRET ?? 'dev-only-secret-please-change-me-32chars+';
if (SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn('[auth] SESSION_SECRET is shorter than 32 chars; sessions may fail.');
}

export const sessionOptions: SessionOptions = {
  password: SECRET,
  cookieName: 'projecthub_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  },
};

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

export async function requireUser() {
  const session = await getSession();
  if (!session.userId) throw new AuthError('Unauthenticated', 401);
  return session as Required<SessionData>;
}

export async function requireRole(roles: Role[]) {
  const session = await requireUser();
  if (!roles.includes(session.role)) throw new AuthError('Forbidden', 403);
  return session;
}

export class AuthError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role as Role;
  await session.save();
  return user;
}

export async function logout() {
  const session = await getSession();
  session.destroy();
}
