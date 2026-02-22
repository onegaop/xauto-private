import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { custom } from 'openid-client';

const allowedEmails = (process.env.GOOGLE_ALLOWED_EMAIL || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const proxyUrl =
  process.env.https_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.http_proxy ||
  process.env.HTTP_PROXY;

const timeoutValue = Number(process.env.GOOGLE_OAUTH_TIMEOUT_MS || '15000');
const oauthTimeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 15000;

const oauthHttpOptions = proxyUrl
  ? {
      timeout: oauthTimeoutMs,
      agent: new HttpsProxyAgent(proxyUrl)
    }
  : {
      timeout: oauthTimeoutMs
    };

custom.setHttpOptionsDefaults(oauthHttpOptions);

const formatMetadata = (metadata: unknown): string => {
  if (!metadata) {
    return '';
  }

  if (metadata instanceof Error) {
    return metadata.message;
  }

  if (typeof metadata === 'object') {
    const record = metadata as Record<string, unknown>;
    const providerPart = typeof record.providerId === 'string' ? `provider=${record.providerId} ` : '';
    const error = record.error;

    if (error instanceof Error) {
      return `${providerPart}${error.message}`.trim();
    }

    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;
      const message = typeof errorRecord.message === 'string' ? errorRecord.message : '';
      if (message) {
        return `${providerPart}${message}`.trim();
      }
    }
  }

  try {
    return JSON.stringify(metadata);
  } catch {
    return String(metadata);
  }
};

export const authOptions: NextAuthOptions = {
  debug: process.env.NEXTAUTH_DEBUG === 'true',
  logger: {
    error(code, metadata) {
      const detail = formatMetadata(metadata);
      process.stderr.write(`[next-auth][error] ${String(code)}${detail ? ` ${detail}` : ''}\n`);
    }
  },
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
