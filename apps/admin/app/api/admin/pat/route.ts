import { NextRequest, NextResponse } from 'next/server';
import { callBackend } from '@/lib/backend';
import { requireAdminSession } from '@/lib/require-admin-session';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await requireAdminSession();
    const body = (await request.json()) as Record<string, unknown>;
    const response = await callBackend('/v1/admin/pat', 'POST', email, body);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unauthorized' }, { status: 401 });
  }
}
