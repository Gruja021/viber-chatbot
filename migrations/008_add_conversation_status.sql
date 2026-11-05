-- Add conversation_status enum and column to conversations table
CREATE TYPE conversation_status AS ENUM ('ai_active', 'pending_human', 'human_active', 'closed');
ALTER TABLE conversations ADD COLUMN conversation_status conversation_status NOT NULL DEFAULT 'ai_active';

-- Migrate existing data
UPDATE conversations SET conversation_status = 'human_active' WHERE is_handover = TRUE;
UPDATE conversations SET conversation_status = 'pending_human' WHERE pending_agent_response = TRUE AND is_handover = FALSE;

CREATE INDEX idx_conversations_status ON conversations (conversation_status);
