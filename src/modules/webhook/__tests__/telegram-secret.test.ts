import { generateTelegramSecretToken, verifyTelegramWebhookSecret } from '../telegram.service';

// Use real implementations (not mocked)
jest.unmock('../telegram.service');

describe('Telegram webhook secret token', () => {
  describe('generateTelegramSecretToken', () => {
    it('returns a hex string of 64 characters', () => {
      const token = generateTelegramSecretToken('bot-token-123');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — same input produces same output', () => {
      const t1 = generateTelegramSecretToken('my-bot-token');
      const t2 = generateTelegramSecretToken('my-bot-token');
      expect(t1).toBe(t2);
    });

    it('different bot tokens produce different secrets', () => {
      const t1 = generateTelegramSecretToken('bot-token-aaa');
      const t2 = generateTelegramSecretToken('bot-token-bbb');
      expect(t1).not.toBe(t2);
    });

    it('handles empty string bot token', () => {
      const token = generateTelegramSecretToken('');
      expect(token).toHaveLength(64);
    });
  });

  describe('verifyTelegramWebhookSecret', () => {
    const botToken = 'test-bot-token-456';

    it('returns true for valid secret token', () => {
      const secret = generateTelegramSecretToken(botToken);
      expect(verifyTelegramWebhookSecret(botToken, secret)).toBe(true);
    });

    it('returns false for undefined header value', () => {
      expect(verifyTelegramWebhookSecret(botToken, undefined)).toBe(false);
    });

    it('returns false for empty string header value', () => {
      expect(verifyTelegramWebhookSecret(botToken, '')).toBe(false);
    });

    it('returns false for wrong secret token', () => {
      expect(verifyTelegramWebhookSecret(botToken, 'wrong-secret-value')).toBe(false);
    });

    it('returns false when secret from different bot token is used', () => {
      const wrongSecret = generateTelegramSecretToken('different-bot-token');
      expect(verifyTelegramWebhookSecret(botToken, wrongSecret)).toBe(false);
    });

    it('returns false for secret with different length', () => {
      expect(verifyTelegramWebhookSecret(botToken, 'short')).toBe(false);
    });

    it('returns false for secret with correct length but wrong content', () => {
      const secret = generateTelegramSecretToken(botToken);
      // Flip one character
      const wrongSecret = secret.substring(0, 63) + (secret[63] === 'a' ? 'b' : 'a');
      expect(verifyTelegramWebhookSecret(botToken, wrongSecret)).toBe(false);
    });
  });
});
