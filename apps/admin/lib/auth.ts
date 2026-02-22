import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const allowedEmail = process.env.GOOGLE_ALLOWED_EMAIL?.toLowerCase();

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
      if (!email || !allowedEmail) {
        return false;
      }

      return email === allowedEmail;
    },
    async session({ session }) {
      return session;
    }
  },
  session: {
    strategy: 'jwt'
  }
};
