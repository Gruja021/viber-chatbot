import axios from 'axios';
import { telegramService } from '../telegram.service';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('telegramService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendTextMessage', () => {
    it('sends message via Telegram API', async () => {
      mockAxios.post.mockResolvedValue({ data: { ok: true } });

      await telegramService.sendTextMessage('bot-token', 123, 'Hello');

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.telegram.org/botbot-token/sendMessage',
        { chat_id: 123, text: 'Hello' }
      );
    });

    it('throws on network error', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));
      await expect(
        telegramService.sendTextMessage('bot-token', 123, 'Hello')
      ).rejects.toThrow('Network error');
    });
  });

  describe('setWebhook', () => {
    it('registers webhook URL', async () => {
      mockAxios.post.mockResolvedValue({ data: { ok: true } });

      await telegramService.setWebhook('bot-token', 'https://example.com/webhook');

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.telegram.org/botbot-token/setWebhook',
        { url: 'https://example.com/webhook', allowed_updates: ['message'] }
      );
    });

    it('throws when API returns not ok', async () => {
      mockAxios.post.mockResolvedValue({ data: { ok: false, description: 'Bad request' } });
      await expect(
        telegramService.setWebhook('bot-token', 'https://example.com/webhook')
      ).rejects.toThrow('Telegram setWebhook failed: Bad request');
    });
  });

  describe('getMe', () => {
    it('returns bot info', async () => {
      const botInfo = { id: 123, first_name: 'TestBot', username: 'test_bot' };
      mockAxios.get.mockResolvedValue({ data: { ok: true, result: botInfo } });

      const result = await telegramService.getMe('bot-token');
      expect(result).toEqual(botInfo);
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://api.telegram.org/botbot-token/getMe'
      );
    });

    it('throws when API returns not ok', async () => {
      mockAxios.get.mockResolvedValue({ data: { ok: false, description: 'Unauthorized' } });
      await expect(telegramService.getMe('bad-token')).rejects.toThrow('Telegram getMe failed: Unauthorized');
    });
  });
});
