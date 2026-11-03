export interface ViberSender {
  id: string;
  name: string;
  avatar?: string;
}

export interface ViberMessage {
  type: string;
  text?: string;
  media?: string;
  thumbnail?: string;
}

export interface ViberWebhookEvent {
  event: string;
  timestamp: number;
  chat_hostname?: string;
  message_token?: number;
  sender?: ViberSender;
  message?: ViberMessage;
  user_id?: string; // for 'unsubscribed' event
}

export function isMessageEvent(payload: ViberWebhookEvent): boolean {
  return payload.event === 'message';
}

export function isConversationStarted(payload: ViberWebhookEvent): boolean {
  return payload.event === 'conversation_started';
}

export function isSubscribed(payload: ViberWebhookEvent): boolean {
  return payload.event === 'subscribed';
}

export function isUnsubscribed(payload: ViberWebhookEvent): boolean {
  return payload.event === 'unsubscribed';
}

export function isWebhookEvent(payload: ViberWebhookEvent): boolean {
  return payload.event === 'webhook';
}

export function getTextContent(payload: ViberWebhookEvent): string | null {
  if (payload.message?.type === 'text' && payload.message.text) {
    return payload.message.text;
  }
  return null;
}
