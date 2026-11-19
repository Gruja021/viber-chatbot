import { RestAPIConnector } from '../RestAPIConnector';
import axios from 'axios';

jest.mock('axios');
(axios.create as jest.Mock).mockReturnValue({ get: jest.fn() });

describe('RestAPIConnector SSRF protection', () => {
  const baseCreds = {
    search_endpoint: '/api/search',
    search_param: 'q',
  };

  describe('blocks private/internal URLs', () => {
    const blockedUrls = [
      'http://localhost/api',
      'http://127.0.0.1/api',
      'http://0.0.0.0/api',
      'http://[::1]/api',
      'http://10.0.0.1/api',
      'http://10.255.255.255/api',
      'http://172.16.0.1/api',
      'http://172.31.255.255/api',
      'http://192.168.0.1/api',
      'http://192.168.1.100/api',
      'http://169.254.169.254/api',  // AWS metadata
      'http://service.local/api',
      'http://internal-db.internal/api',
      'http://127.0.0.2/api',        // 127.x.x.x range
    ];

    for (const url of blockedUrls) {
      it(`blocks ${url}`, () => {
        expect(() => {
          new RestAPIConnector({ ...baseCreds, base_url: url });
        }).toThrow('SSRF protection: cannot connect to private/internal URLs');
      });
    }
  });

  describe('allows public URLs', () => {
    const allowedUrls = [
      'https://api.example.com',
      'https://8.8.8.8/api',
      'https://httpbin.org/anything',
      'https://api.openai.com/v1',
    ];

    for (const url of allowedUrls) {
      it(`allows ${url}`, () => {
        expect(() => {
          new RestAPIConnector({ ...baseCreds, base_url: url });
        }).not.toThrow();
      });
    }
  });

  describe('edge cases', () => {
    it('blocks invalid URLs', () => {
      expect(() => {
        new RestAPIConnector({ ...baseCreds, base_url: 'not-a-url' });
      }).toThrow('SSRF protection');
    });

    it('blocks 172.16.x.x but allows 172.15.x.x and 172.32.x.x', () => {
      expect(() => {
        new RestAPIConnector({ ...baseCreds, base_url: 'http://172.16.0.1/api' });
      }).toThrow('SSRF protection');

      expect(() => {
        new RestAPIConnector({ ...baseCreds, base_url: 'http://172.15.0.1/api' });
      }).not.toThrow();

      expect(() => {
        new RestAPIConnector({ ...baseCreds, base_url: 'http://172.32.0.1/api' });
      }).not.toThrow();
    });

    it('sets maxRedirects to 0 to prevent redirect-based SSRF', async () => {
      const mockGet = jest.fn().mockResolvedValue({ data: [] });
      (axios.create as jest.Mock).mockReturnValue({ get: mockGet });

      const connector = new RestAPIConnector({ ...baseCreds, base_url: 'https://api.example.com' });
      await connector.query('test');

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ maxRedirects: 0 })
      );
    });
  });
});
