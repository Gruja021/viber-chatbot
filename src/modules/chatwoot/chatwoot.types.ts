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

// --- Platform API types (super admin) ---

export interface ChatwootCreateAccountResult {
  id: number;
  name: string;
}

export interface ChatwootCreateAccountUserResult {
  id: number;
  name: string;
  email: string;
  access_token: string;
}

export interface ChatwootSetupWebhookOptions {
  chatwootApiToken: string;
  chatwootAccountId: number;
  webhookUrl: string;
}

export interface ChatwootProvisionResult {
  chatwoot_account_id: number;
  chatwoot_inbox_id: number;
  chatwoot_api_token: string;
}
