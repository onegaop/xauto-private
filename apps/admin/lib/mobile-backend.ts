import { NextRequest } from 'next/server';

const getApiBaseUrl = (): string => {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) {
    throw new Error('API_BASE_URL is not configured');
  }

  return baseUrl.replace(/\/$/, '');
};

export const extractPatToken = (request: NextRequest): string => {
  const byHeader = request.headers.get('x-pat-token')?.trim() ?? '';
  if (byHeader) {
    return byHeader;
  }

  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return '';
};

export const callMobileBackend = async (path: string, patToken: string): Promise<Response> => {
  const url = `${getApiBaseUrl()}${path}`;
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${patToken}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });
};

export const parseBackendPayload = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
};
