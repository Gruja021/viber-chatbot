import { Platform } from '../../types/platform';

export interface Conversation {
  id: string;
  tenant_id: string;
  platform: Platform;
  platform_user_id: string;
  platform_user_name: string | null;
  chatwoot_conversation_id: number | null;
  is_handover: boolean;
  handover_until: Date | null;
  pending_agent_response: boolean;
  agent_routed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  platform_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}
