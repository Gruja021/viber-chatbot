export interface ChatwootSendMessageOptions {
  chatwootApiToken: string;
  chatwootAccountId: number;
  conversationId: number;
  content: string;
  messageType: 'incoming' | 'outgoing';
}

export interface ChatwootCreateConversationOptions {
  chatwootApiToken: string;
  chatwootAccountId: number;
  inboxId: number;
  contactName: string;
  identifier: string;
}

export interface ChatwootContact {
  id: number;
  name: string;
  identifier: string;
}

export interface ChatwootConversation {
  id: number;
  inbox_id: number;
  contact: ChatwootContact;
}
