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

  const headers: Record<string, string> = {
    'x-admin-email': adminEmail,
    'x-admin-internal-token': process.env.ADMIN_INTERNAL_TOKEN || ''
  };

  const requestBody = body ? JSON.stringify(body) : undefined;
  if (requestBody) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    method,
    headers,
    body: requestBody,
    cache: 'no-store'
  });
};
