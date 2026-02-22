import { NextRequest, NextResponse } from 'next/server';
import { callBackend } from '@/lib/backend';
import { requireAdminSession } from '@/lib/require-admin-session';
import { adminProxyError } from '@/lib/admin-proxy-error';

export async function GET(): Promise<NextResponse> {
  try {
    const { email } = await requireAdminSession();
    const response = await callBackend('/v1/admin/sync-settings', 'GET', email);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return adminProxyError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await requireAdminSession();
    const body = (await request.json()) as Record<string, unknown>;
    const response = await callBackend('/v1/admin/sync-settings', 'POST', email, body);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return adminProxyError(error);
  }
}
