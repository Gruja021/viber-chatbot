-- Indexes to support data retention cleanup queries

-- Index for deleting old messages by created_at
CREATE INDEX IF NOT EXISTS idx_messages_created_at_only ON messages (created_at);

-- Index for deleting old closed conversations by status and updated_at
CREATE INDEX IF NOT EXISTS idx_conversations_status_updated ON conversations (conversation_status, updated_at);
