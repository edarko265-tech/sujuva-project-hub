import { NextResponse } from 'next/server';
import { logout } from '@/lib/auth';

async function handle(req: Request) {
  await logout();
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
}

export const POST = handle;
export const GET = handle;
