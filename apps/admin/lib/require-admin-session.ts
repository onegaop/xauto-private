import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

export const requireAdminSession = async (): Promise<{ email: string }> => {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  const allowed = (process.env.GOOGLE_ALLOWED_EMAIL || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!email || allowed.length === 0 || !allowed.includes(email)) {
    throw new Error('Unauthorized');
  }

  return { email };
};
