import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const allowedEmails = (process.env.GOOGLE_ALLOWED_EMAIL || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
    })
  ],
  pages: {
    signIn: '/'
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email || allowedEmails.length === 0) {
        return false;
      }

      return allowedEmails.includes(email);
    },
    async session({ session }) {
      return session;
    }
  },
  session: {
    strategy: 'jwt'
  }
};
