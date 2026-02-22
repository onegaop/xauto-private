import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

export const requireAdminSession = async (): Promise<{ email: string }> => {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  const allowed = process.env.GOOGLE_ALLOWED_EMAIL?.toLowerCase();

  if (!email || !allowed || email !== allowed) {
    throw new Error('Unauthorized');
  }

  return { email };
};
