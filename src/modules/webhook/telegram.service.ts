import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../../config/logger';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function botUrl(botToken: string): string {
  return `${TELEGRAM_API_BASE}/bot${botToken}`;
}

/**
 * Generate a deterministic secret_token for a bot (derived from bot token).
 * Telegram will send this back in X-Telegram-Bot-Api-Secret-Token header.
 */
export function generateTelegramSecretToken(botToken: string): string {
  return crypto.createHmac('sha256', botToken).update('webhook-secret').digest('hex').substring(0, 64);
}

/**
 * Verify the X-Telegram-Bot-Api-Secret-Token header from an incoming webhook request.
 */
export function verifyTelegramWebhookSecret(botToken: string, headerValue: string | undefined): boolean {
  if (!headerValue) return false;
  const expected = generateTelegramSecretToken(botToken);
  const headerBuf = Buffer.from(headerValue, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (headerBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

export const telegramService = {
  async sendTextMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
    try {
      const response = await axios.post(`${botUrl(botToken)}/sendMessage`, {
        chat_id: chatId,
        text,
      });

      if (!response.data.ok) {
        logger.error(
          { description: response.data.description },
          'Telegram API returned error'
        );
      }
    } catch (err) {
      logger.error({ err }, 'Failed to send Telegram message');
      throw err;
    }
  },

  async setWebhook(botToken: string, url: string): Promise<void> {
    try {
      const secretToken = generateTelegramSecretToken(botToken);
      const response = await axios.post(`${botUrl(botToken)}/setWebhook`, {
        url,
        allowed_updates: ['message'],
        secret_token: secretToken,
      });

      if (!response.data.ok) {
        throw new Error(`Telegram setWebhook failed: ${response.data.description}`);
      }

      logger.info({ url }, 'Telegram webhook registered with secret token');
    } catch (err) {
      logger.error({ err }, 'Failed to register Telegram webhook');
      throw err;
    }
  },

  async getMe(botToken: string): Promise<{ id: number; first_name: string; username: string }> {
    try {
      const response = await axios.get(`${botUrl(botToken)}/getMe`);

      if (!response.data.ok) {
        throw new Error(`Telegram getMe failed: ${response.data.description}`);
      }

      return response.data.result;
    } catch (err) {
      logger.error({ err }, 'Failed to get Telegram bot info');
      throw err;
    }
  },
};
