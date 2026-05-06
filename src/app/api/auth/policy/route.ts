import { NextResponse } from 'next/server';
import { getAllowedEmailDomains } from '@/lib/emailDomains';

/**
 * Public-ish policy endpoint exposing the list of approved email domains
 * so the admin UI can show a hint to the operator.
 */
export async function GET() {
  return NextResponse.json({
    allowedEmailDomains: getAllowedEmailDomains(),
    allowLocalInDev: process.env.NODE_ENV !== 'production',
  });
}
