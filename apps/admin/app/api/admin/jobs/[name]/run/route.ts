import { NextRequest, NextResponse } from 'next/server';
import { callBackend } from '@/lib/backend';
import { requireAdminSession } from '@/lib/require-admin-session';

export async function POST(
  _request: NextRequest,
  context: { params: { name: string } }
): Promise<NextResponse> {
  try {
    const { email } = await requireAdminSession();
    const response = await callBackend(`/v1/admin/jobs/${encodeURIComponent(context.params.name)}/run`, 'POST', email);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unauthorized' }, { status: 401 });
  }
}
