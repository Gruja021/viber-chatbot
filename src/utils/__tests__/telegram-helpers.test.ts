import {
  isTelegramTextMessage,
  getTelegramTextContent,
  getTelegramSenderName,
  TelegramUpdate,
  TelegramMessage,
} from '../telegram-helpers';

function makeUpdate(overrides: Partial<TelegramUpdate> = {}): TelegramUpdate {
  return { update_id: 1, ...overrides };
}

function makeMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 100,
    chat: { id: 123, type: 'private' },
    date: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe('telegram-helpers', () => {
  describe('isTelegramTextMessage', () => {
    it('returns true when message has text and from', () => {
      const update = makeUpdate({
        message: makeMessage({
          text: 'Hello',
          from: { id: 1, is_bot: false, first_name: 'User' },
        }),
      });
      expect(isTelegramTextMessage(update)).toBe(true);
    });

    it('returns false when message has no text', () => {
      const update = makeUpdate({
        message: makeMessage({
          from: { id: 1, is_bot: false, first_name: 'User' },
        }),
      });
      expect(isTelegramTextMessage(update)).toBe(false);
    });

    it('returns false when message has no from', () => {
      const update = makeUpdate({
        message: makeMessage({ text: 'Hello' }),
      });
      expect(isTelegramTextMessage(update)).toBe(false);
    });

    it('returns false when no message', () => {
      expect(isTelegramTextMessage(makeUpdate())).toBe(false);
    });
  });

  describe('getTelegramTextContent', () => {
    it('returns text when present', () => {
      const update = makeUpdate({
        message: makeMessage({ text: 'Hello world' }),
      });
      expect(getTelegramTextContent(update)).toBe('Hello world');
    });

    it('returns null when no text', () => {
      const update = makeUpdate({
        message: makeMessage(),
      });
      expect(getTelegramTextContent(update)).toBeNull();
    });

    it('returns null when no message', () => {
      expect(getTelegramTextContent(makeUpdate())).toBeNull();
    });
  });

  describe('getTelegramSenderName', () => {
    it('returns first_name when no last_name', () => {
      const msg = makeMessage({
        from: { id: 1, is_bot: false, first_name: 'John' },
      });
      expect(getTelegramSenderName(msg)).toBe('John');
    });

    it('returns full name when last_name present', () => {
      const msg = makeMessage({
        from: { id: 1, is_bot: false, first_name: 'John', last_name: 'Doe' },
      });
      expect(getTelegramSenderName(msg)).toBe('John Doe');
    });

    it('returns Unknown when no from', () => {
      const msg = makeMessage();
      expect(getTelegramSenderName(msg)).toBe('Unknown');
    });
  });
});
