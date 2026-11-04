export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export function isTelegramTextMessage(update: TelegramUpdate): boolean {
  return !!update.message?.text && !!update.message?.from;
}

export function getTelegramTextContent(update: TelegramUpdate): string | null {
  if (update.message?.text) {
    return update.message.text;
  }
  return null;
}

export function getTelegramSenderName(message: TelegramMessage): string {
  const from = message.from;
  if (!from) return 'Unknown';
  const parts = [from.first_name];
  if (from.last_name) parts.push(from.last_name);
  return parts.join(' ');
}
