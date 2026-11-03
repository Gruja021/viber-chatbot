ALTER TABLE conversations
  ADD COLUMN pending_agent_response BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN agent_routed_at TIMESTAMPTZ;

CREATE INDEX idx_conversations_pending_agent
  ON conversations (pending_agent_response)
  WHERE pending_agent_response = TRUE;
