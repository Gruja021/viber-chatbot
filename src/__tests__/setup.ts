// Set env vars before any module loads config/env
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.ADMIN_API_TOKEN = 'test-admin-token';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.WEBHOOK_BASE_URL = 'https://test.example.com';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'sk-test-key';

// Mock database pool
jest.mock('../config/database', () => {
  const mockQuery = jest.fn();
  const mockRelease = jest.fn();
  const mockConnect = jest.fn().mockResolvedValue({
    query: mockQuery,
    release: mockRelease,
  });
  return {
    pool: {
      query: mockQuery,
      connect: mockConnect,
    },
    checkDatabaseConnection: jest.fn().mockResolvedValue(true),
  };
});

// Mock Redis
jest.mock('../config/redis', () => {
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    call: jest.fn().mockResolvedValue(null),
    disconnect: jest.fn(),
  };
  return {
    redis: mockRedis,
    checkRedisConnection: jest.fn().mockResolvedValue(true),
  };
});

// Mock logger (silent)
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

// Mock rate limiters (no-op for tests)
jest.mock('../middleware/rate-limiter', () => ({
  webhookRateLimiter: (_req: any, _res: any, next: any) => next(),
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));
