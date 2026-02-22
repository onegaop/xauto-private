import { NextRequest, NextResponse } from 'next/server';
import { callBackend } from '@/lib/backend';
import { requireAdminSession } from '@/lib/require-admin-session';
import { adminProxyError } from '@/lib/admin-proxy-error';

export async function POST(
  request: NextRequest,
  context: { params: { name: string } }
): Promise<NextResponse> {
  try {
    const { email } = await requireAdminSession();
    const contentType = request.headers.get('content-type') ?? '';
    let body: Record<string, unknown> | undefined;
    if (contentType.includes('application/json')) {
      body = (await request.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    }

    const response = await callBackend(
      `/v1/admin/jobs/${encodeURIComponent(context.params.name)}/run`,
      'POST',
      email,
      body
    );
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return adminProxyError(error);
  }
}
