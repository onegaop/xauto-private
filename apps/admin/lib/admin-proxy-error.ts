import { NextResponse } from 'next/server';

export const adminProxyError = (error: unknown): NextResponse => {
  const message = error instanceof Error ? error.message : 'Unexpected proxy error';
  const status = message === 'Unauthorized' ? 401 : 502;
  return NextResponse.json({ error: message }, { status });
};
