import { NextRequest, NextResponse } from 'next/server';
import { callMobileBackend, extractPatToken, parseBackendPayload } from '@/lib/mobile-backend';

export async function GET(
  request: NextRequest,
  context: { params: { tweetId: string } }
): Promise<NextResponse> {
  try {
    const patToken = extractPatToken(request);
    if (!patToken) {
      return NextResponse.json({ error: 'Missing PAT token' }, { status: 400 });
    }

    const tweetId = encodeURIComponent(context.params.tweetId);
    const response = await callMobileBackend(`/v1/mobile/items/${tweetId}`, patToken);
    const payload = await parseBackendPayload(response);

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch item detail' },
      { status: 500 }
    );
  }
}
