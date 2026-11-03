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

export interface ChatwootCreateInboxOptions {
  chatwootApiToken: string;
  chatwootAccountId: number;
  name: string;
  channelType?: string;
}

export interface ChatwootCreateInboxResult {
  id: number;
  name: string;
  channel_type: string;
}

export interface ChatwootAddAgentToInboxOptions {
  chatwootApiToken: string;
  chatwootAccountId: number;
  inboxId: number;
  agentIds: number[];
}
