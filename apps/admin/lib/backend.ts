export const callBackend = async (
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  adminEmail: string,
  body?: Record<string, unknown>
): Promise<Response> => {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) {
    throw new Error('API_BASE_URL is not configured');
  }

  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-email': adminEmail,
      'x-admin-internal-token': process.env.ADMIN_INTERNAL_TOKEN || ''
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
};
