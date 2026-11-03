import axios from 'axios';
import { viberService } from '../viber.service';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('viberService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendTextMessage', () => {
    const options = {
      authToken: 'viber-token',
      receiverId: 'user-123',
      text: 'Hello!',
      senderName: 'TestBot',
    };

    it('sends message successfully', async () => {
      mockAxios.post.mockResolvedValue({ data: { status: 0, status_message: 'ok' } });

      await viberService.sendTextMessage(options);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://chatapi.viber.com/pa/send_message',
        expect.objectContaining({
          receiver: 'user-123',
          type: 'text',
          text: 'Hello!',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Viber-Auth-Token': 'viber-token',
          }),
        })
      );
    });

    it('logs error when Viber returns non-zero status (does not throw)', async () => {
      mockAxios.post.mockResolvedValue({
        data: { status: 1, status_message: 'invalid receiver' },
      });

      // Should not throw since Viber API responded (just with error status)
      await expect(viberService.sendTextMessage(options)).resolves.not.toThrow();
    });

    it('throws on axios rejection', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));
      await expect(viberService.sendTextMessage(options)).rejects.toThrow('Network error');
    });
  });

  describe('getAccountInfo', () => {
    it('returns account info on success', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          status: 0,
          status_message: 'ok',
          name: 'Test Bot',
          uri: 'testbot',
          webhook: 'https://example.com/webhook',
          subscribers_count: 10,
        },
      });

      const result = await viberService.getAccountInfo('viber-token');

      expect(result.name).toBe('Test Bot');
      expect(result.webhook).toBe('https://example.com/webhook');
      expect(result.subscribers_count).toBe(10);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://chatapi.viber.com/pa/get_account_info',
        {},
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Viber-Auth-Token': 'viber-token',
          }),
        })
      );
    });

    it('throws when Viber returns error status', async () => {
      mockAxios.post.mockResolvedValue({
        data: { status: 1, status_message: 'invalid token' },
      });

      await expect(viberService.getAccountInfo('bad-token')).rejects.toThrow(
        'Viber get_account_info failed: invalid token'
      );
    });

    it('throws on axios rejection', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));
      await expect(viberService.getAccountInfo('viber-token')).rejects.toThrow('Network error');
    });

    it('returns all expected fields from response', async () => {
      const accountData = {
        status: 0,
        status_message: 'ok',
        name: 'Full Bot',
        uri: 'fullbot',
        webhook: 'https://example.com/hook',
        subscribers_count: 100,
      };
      mockAxios.post.mockResolvedValue({ data: accountData });

      const result = await viberService.getAccountInfo('viber-token');

      expect(result.status).toBe(0);
      expect(result.status_message).toBe('ok');
      expect(result.name).toBe('Full Bot');
      expect(result.uri).toBe('fullbot');
      expect(result.webhook).toBe('https://example.com/hook');
      expect(result.subscribers_count).toBe(100);
    });

    it('sends empty body in POST request', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          status: 0,
          status_message: 'ok',
          name: 'Bot',
          uri: 'bot',
          webhook: '',
          subscribers_count: 0,
        },
      });

      await viberService.getAccountInfo('viber-token');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        {},
        expect.any(Object)
      );
    });

    it('includes error status_message in thrown error', async () => {
      mockAxios.post.mockResolvedValue({
        data: { status: 2, status_message: 'token not found' },
      });

      await expect(viberService.getAccountInfo('bad')).rejects.toThrow('token not found');
    });
  });

  describe('setWebhook', () => {
    it('registers webhook successfully', async () => {
      mockAxios.post.mockResolvedValue({ data: { status: 0, status_message: 'ok' } });

      await viberService.setWebhook('viber-token', 'https://example.com/webhook');
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://chatapi.viber.com/pa/set_webhook',
        expect.objectContaining({ url: 'https://example.com/webhook' }),
        expect.any(Object)
      );
    });

    it('throws when Viber returns error status', async () => {
      mockAxios.post.mockResolvedValue({
        data: { status: 1, status_message: 'bad url' },
      });

      await expect(
        viberService.setWebhook('viber-token', 'http://bad-url')
      ).rejects.toThrow('Viber set_webhook failed: bad url');
    });

    it('throws on axios rejection', async () => {
      mockAxios.post.mockRejectedValue(new Error('Connection refused'));
      await expect(
        viberService.setWebhook('viber-token', 'https://example.com/webhook')
      ).rejects.toThrow('Connection refused');
    });
  });
});
