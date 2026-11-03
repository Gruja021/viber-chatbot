import {
  isMessageEvent,
  isConversationStarted,
  isSubscribed,
  isUnsubscribed,
  isWebhookEvent,
  getTextContent,
  ViberWebhookEvent,
} from '../viber-helpers';

function makeEvent(event: string, extra: Partial<ViberWebhookEvent> = {}): ViberWebhookEvent {
  return { event, timestamp: Date.now(), ...extra };
}

describe('viber-helpers', () => {
  describe('isMessageEvent', () => {
    it('returns true for message event', () => {
      expect(isMessageEvent(makeEvent('message'))).toBe(true);
    });
    it('returns false for other events', () => {
      expect(isMessageEvent(makeEvent('webhook'))).toBe(false);
      expect(isMessageEvent(makeEvent('subscribed'))).toBe(false);
      expect(isMessageEvent(makeEvent('conversation_started'))).toBe(false);
    });
  });

  describe('isConversationStarted', () => {
    it('returns true for conversation_started', () => {
      expect(isConversationStarted(makeEvent('conversation_started'))).toBe(true);
    });
    it('returns false for other events', () => {
      expect(isConversationStarted(makeEvent('message'))).toBe(false);
      expect(isConversationStarted(makeEvent('webhook'))).toBe(false);
    });
  });

  describe('isSubscribed', () => {
    it('returns true for subscribed', () => {
      expect(isSubscribed(makeEvent('subscribed'))).toBe(true);
    });
    it('returns false for other events', () => {
      expect(isSubscribed(makeEvent('unsubscribed'))).toBe(false);
      expect(isSubscribed(makeEvent('message'))).toBe(false);
    });
  });

  describe('isUnsubscribed', () => {
    it('returns true for unsubscribed', () => {
      expect(isUnsubscribed(makeEvent('unsubscribed'))).toBe(true);
    });
    it('returns false for other events', () => {
      expect(isUnsubscribed(makeEvent('subscribed'))).toBe(false);
      expect(isUnsubscribed(makeEvent('message'))).toBe(false);
    });
  });

  describe('isWebhookEvent', () => {
    it('returns true for webhook event', () => {
      expect(isWebhookEvent(makeEvent('webhook'))).toBe(true);
    });
    it('returns false for other events', () => {
      expect(isWebhookEvent(makeEvent('message'))).toBe(false);
      expect(isWebhookEvent(makeEvent('conversation_started'))).toBe(false);
    });
  });

  describe('getTextContent', () => {
    it('returns text for text message', () => {
      const event = makeEvent('message', {
        message: { type: 'text', text: 'Hello!' },
      });
      expect(getTextContent(event)).toBe('Hello!');
    });

    it('returns null for non-text message type', () => {
      const event = makeEvent('message', {
        message: { type: 'picture', media: 'http://example.com/img.jpg' },
      });
      expect(getTextContent(event)).toBeNull();
    });

    it('returns null when text is missing on text type', () => {
      const event = makeEvent('message', {
        message: { type: 'text' },
      });
      expect(getTextContent(event)).toBeNull();
    });

    it('returns null when message is missing', () => {
      const event = makeEvent('message');
      expect(getTextContent(event)).toBeNull();
    });
  });
});
