export interface Conversation {
  id: string;
  tenant_id: string;
  viber_user_id: string;
  viber_user_name: string | null;
  chatwoot_conversation_id: number | null;
  is_handover: boolean;
  handover_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  viber_message_token: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}
