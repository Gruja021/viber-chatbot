import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const env = {
  PORT: parseInt(optional('PORT', '3000'), 10),
  NODE_ENV: optional('NODE_ENV', 'development'),
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: optional('REDIS_URL', 'redis://localhost:6379'),
  ADMIN_API_TOKEN: required('ADMIN_API_TOKEN'),
  ENCRYPTION_KEY: required('ENCRYPTION_KEY'),
  WEBHOOK_BASE_URL: required('WEBHOOK_BASE_URL'),
  OPENAI_API_KEY: required('OPENAI_API_KEY'),
} as const;
