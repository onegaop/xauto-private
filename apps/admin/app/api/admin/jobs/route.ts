import { NextRequest, NextResponse } from 'next/server';
import { callBackend } from '@/lib/backend';
import { requireAdminSession } from '@/lib/require-admin-session';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await requireAdminSession();
    const limit = request.nextUrl.searchParams.get('limit') ?? '30';
    const response = await callBackend(`/v1/admin/jobs?limit=${encodeURIComponent(limit)}`, 'GET', email);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unauthorized' }, { status: 401 });
  }
}
