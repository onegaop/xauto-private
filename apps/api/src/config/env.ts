import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('8080').transform((value) => Number(value)),
  MONGODB_URI: z.string().min(1),
  APP_BASE_URL: z.string().url().default('http://localhost:8080'),
  TIMEZONE: z.string().default('Asia/Shanghai'),

  INTERNAL_JOB_TOKEN: z.string().optional(),

  ADMIN_ALLOWED_EMAILS: z.string().default(''),
  ADMIN_INTERNAL_TOKEN: z.string().optional(),

  ENCRYPTION_MASTER_KEY: z.string().min(1),

  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  X_REDIRECT_URI: z.string().optional(),
  X_OAUTH_AUTHORIZE_URL: z.string().url().default('https://twitter.com/i/oauth2/authorize'),
  X_OAUTH_TOKEN_URL: z.string().url().default('https://api.x.com/2/oauth2/token'),
  X_API_BASE_URL: z.string().url().default('https://api.x.com/2'),

  BUDGET_CNY_MONTHLY: z.string().default('100').transform((value) => Number(value))
});

export type Env = z.infer<typeof envSchema> & { adminAllowedEmails: string[] };

let cachedEnv: Env | null = null;

export const getEnv = (): Env => {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.parse(process.env);
  const adminAllowedEmails = parsed.ADMIN_ALLOWED_EMAILS.split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  cachedEnv = {
    ...parsed,
    adminAllowedEmails
  };

  return cachedEnv;
};
