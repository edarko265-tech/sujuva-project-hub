import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError } from './auth';

/** Shared API error → JSON response mapper. */
export function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json({ error: 'Validation', issues: e.issues }, { status: 400 });
  }
  // eslint-disable-next-line no-console
  console.error(e);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
