import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const loadLocalEnvFile = (): void => {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'apps/api/.env')];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, 'utf8');

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }

    break;
  }
};

loadLocalEnvFile();

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
