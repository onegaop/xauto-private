import { NextRequest, NextResponse } from 'next/server';
import { callMobileBackend, extractPatToken, parseBackendPayload } from '@/lib/mobile-backend';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const patToken = extractPatToken(request);
    if (!patToken) {
      return NextResponse.json({ error: 'Missing PAT token' }, { status: 400 });
    }

    const query = request.nextUrl.searchParams.toString();
    const path = query ? `/v1/mobile/summary/stats?${query}` : '/v1/mobile/summary/stats';
    const response = await callMobileBackend(path, patToken);
    const payload = await parseBackendPayload(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch summary stats' },
      { status: 500 }
    );
  }
}
