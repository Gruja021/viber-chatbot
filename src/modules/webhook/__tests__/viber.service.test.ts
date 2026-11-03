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
