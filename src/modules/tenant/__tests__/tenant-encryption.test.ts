import { tenantRepository } from '../tenant.repository';
import { pool } from '../../../config/database';
import { encrypt, decrypt } from '../../../utils/crypto';

jest.mock('../../../utils/crypto');
const mockQuery = pool.query as jest.Mock;
const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;
const mockDecrypt = decrypt as jest.MockedFunction<typeof decrypt>;

describe('tenantRepository — token encryption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncrypt.mockImplementation((val: string) => Buffer.from(`enc:${val}`));
    mockDecrypt.mockImplementation((val: Buffer) => {
      const str = val.toString('utf8');
      return str.startsWith('enc:') ? str.substring(4) : str;
    });
  });

  describe('create — encrypts all sensitive tokens', () => {
    it('encrypts viber_auth_token on create', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'uuid-1', viber_auth_token: Buffer.from('enc:viber-token'), telegram_bot_token: null, openai_api_key: null, chatwoot_api_token: null }],
      });

      await tenantRepository.create({
        slug: 'test',
        firm_name: 'Test',
        viber_auth_token: 'viber-token',
      });

      // Should encrypt the viber token
      expect(mockEncrypt).toHaveBeenCalledWith('viber-token');
      const params = mockQuery.mock.calls[0][1];
      expect(params[2]).toEqual(Buffer.from('enc:viber-token')); // viber_auth_token position
    });

    it('encrypts telegram_bot_token on create', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'uuid-1', viber_auth_token: null, telegram_bot_token: Buffer.from('enc:tg-token'), openai_api_key: null, chatwoot_api_token: null }],
      });

      await tenantRepository.create({
        slug: 'test',
        firm_name: 'Test',
        telegram_bot_token: 'tg-token',
      });

      expect(mockEncrypt).toHaveBeenCalledWith('tg-token');
    });

    it('encrypts openai_api_key on create', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'uuid-1', viber_auth_token: null, telegram_bot_token: null, openai_api_key: Buffer.from('enc:sk-key'), chatwoot_api_token: null }],
      });

      await tenantRepository.create({
        slug: 'test',
        firm_name: 'Test',
        openai_api_key: 'sk-key',
      });

      expect(mockEncrypt).toHaveBeenCalledWith('sk-key');
    });

    it('encrypts chatwoot_api_token on create', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'uuid-1', viber_auth_token: null, telegram_bot_token: null, openai_api_key: null, chatwoot_api_token: Buffer.from('enc:cw-token') }],
      });

      await tenantRepository.create({
        slug: 'test',
        firm_name: 'Test',
        chatwoot_api_token: 'cw-token',
      });

      expect(mockEncrypt).toHaveBeenCalledWith('cw-token');
    });

    it('passes null for empty tokens (no encryption)', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'uuid-1', viber_auth_token: null, telegram_bot_token: null, openai_api_key: null, chatwoot_api_token: null }],
      });

      await tenantRepository.create({
        slug: 'test',
        firm_name: 'Test',
      });

      const params = mockQuery.mock.calls[0][1];
      expect(params[2]).toBeNull(); // viber_auth_token
      expect(params[3]).toBeNull(); // telegram_bot_token
      expect(params[7]).toBeNull(); // openai_api_key
      expect(params[11]).toBeNull(); // chatwoot_api_token
    });
  });

  describe('findAll / findById / findBySlug — decrypts tokens', () => {
    it('decrypts tokens when reading from DB', async () => {
      const encViber = Buffer.from('enc:viber-secret');
      const encTg = Buffer.from('enc:tg-secret');
      const encOai = Buffer.from('enc:sk-openai');
      const encCw = Buffer.from('enc:cw-api-token');

      mockQuery.mockResolvedValue({
        rows: [{
          id: 'uuid-1',
          slug: 'test',
          viber_auth_token: encViber,
          telegram_bot_token: encTg,
          openai_api_key: encOai,
          chatwoot_api_token: encCw,
        }],
      });

      const tenant = await tenantRepository.findById('uuid-1');

      expect(tenant).not.toBeNull();
      expect(tenant!.viber_auth_token).toBe('viber-secret');
      expect(tenant!.telegram_bot_token).toBe('tg-secret');
      expect(tenant!.openai_api_key).toBe('sk-openai');
      expect(tenant!.chatwoot_api_token).toBe('cw-api-token');
    });

    it('handles null tokens (no decryption needed)', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'uuid-1',
          viber_auth_token: null,
          telegram_bot_token: null,
          openai_api_key: null,
          chatwoot_api_token: null,
        }],
      });

      const tenant = await tenantRepository.findById('uuid-1');
      expect(tenant!.viber_auth_token).toBeNull();
      expect(tenant!.telegram_bot_token).toBeNull();
    });

    it('decrypts all tenants in findAll', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: '1', viber_auth_token: Buffer.from('enc:v1'), telegram_bot_token: null, openai_api_key: null, chatwoot_api_token: null },
          { id: '2', viber_auth_token: null, telegram_bot_token: Buffer.from('enc:tg2'), openai_api_key: null, chatwoot_api_token: null },
        ],
      });

      const tenants = await tenantRepository.findAll();
      expect(tenants[0].viber_auth_token).toBe('v1');
      expect(tenants[1].telegram_bot_token).toBe('tg2');
    });
  });

  describe('update — encrypts token fields', () => {
    it('encrypts viber_auth_token on update', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'uuid-1', viber_auth_token: Buffer.from('enc:new-vt'), telegram_bot_token: null, openai_api_key: null, chatwoot_api_token: null }],
      });

      await tenantRepository.update('uuid-1', { viber_auth_token: 'new-vt' });

      expect(mockEncrypt).toHaveBeenCalledWith('new-vt');
      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toEqual(Buffer.from('enc:new-vt'));
    });

    it('encrypts multiple tokens in a single update', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'uuid-1', viber_auth_token: null, telegram_bot_token: null, openai_api_key: null, chatwoot_api_token: null }],
      });

      await tenantRepository.update('uuid-1', {
        viber_auth_token: 'vt',
        telegram_bot_token: 'tg',
        openai_api_key: 'sk',
        chatwoot_api_token: 'cw',
      });

      expect(mockEncrypt).toHaveBeenCalledWith('vt');
      expect(mockEncrypt).toHaveBeenCalledWith('tg');
      expect(mockEncrypt).toHaveBeenCalledWith('sk');
      expect(mockEncrypt).toHaveBeenCalledWith('cw');
    });
  });
});
