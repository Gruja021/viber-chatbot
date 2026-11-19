import request from 'supertest';
import { app } from '../app';
import { checkDatabaseConnection } from '../config/database';
import { checkRedisConnection } from '../config/redis';

const mockCheckDb = checkDatabaseConnection as jest.MockedFunction<typeof checkDatabaseConnection>;
const mockCheckRedis = checkRedisConnection as jest.MockedFunction<typeof checkRedisConnection>;

describe('GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('without auth token', () => {
    it('returns only status when healthy', async () => {
      mockCheckDb.mockResolvedValue(true);
      mockCheckRedis.mockResolvedValue(true);

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(res.body).not.toHaveProperty('database');
      expect(res.body).not.toHaveProperty('redis');
      expect(res.body).not.toHaveProperty('timestamp');
    });

    it('returns only status when degraded', async () => {
      mockCheckDb.mockResolvedValue(false);
      mockCheckRedis.mockResolvedValue(true);

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'degraded' });
      expect(res.body).not.toHaveProperty('database');
    });
  });

  describe('with valid admin auth token', () => {
    it('returns full details when healthy', async () => {
      mockCheckDb.mockResolvedValue(true);
      mockCheckRedis.mockResolvedValue(true);

      const res = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer test-admin-token');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
      expect(res.body.redis).toBe('connected');
      expect(res.body.timestamp).toBeDefined();
    });

    it('returns full details when degraded (database down)', async () => {
      mockCheckDb.mockResolvedValue(false);
      mockCheckRedis.mockResolvedValue(true);

      const res = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer test-admin-token');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.database).toBe('disconnected');
      expect(res.body.redis).toBe('connected');
    });

    it('returns full details when degraded (redis down)', async () => {
      mockCheckDb.mockResolvedValue(true);
      mockCheckRedis.mockResolvedValue(false);

      const res = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer test-admin-token');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.database).toBe('connected');
      expect(res.body.redis).toBe('disconnected');
    });
  });

  describe('with invalid admin auth token', () => {
    it('returns minimal response with wrong token', async () => {
      mockCheckDb.mockResolvedValue(true);
      mockCheckRedis.mockResolvedValue(true);

      const res = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer wrong-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(res.body).not.toHaveProperty('database');
    });
  });
});
