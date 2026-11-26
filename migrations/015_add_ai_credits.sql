-- Migration 015: Add AI credit limits
-- Adds per-tenant credit system for controlling AI usage

-- New columns on tenants table
ALTER TABLE tenants ADD COLUMN monthly_credit_limit INTEGER DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN credits_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN bonus_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN credits_reset_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN per_conversation_message_limit INTEGER DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN credit_limit_message TEXT DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN auto_escalate_media BOOLEAN NOT NULL DEFAULT true;

-- New column on conversations table
ALTER TABLE conversations ADD COLUMN ai_message_count INTEGER NOT NULL DEFAULT 0;

-- Credit usage log table
CREATE TABLE ai_credit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  credit_type VARCHAR(50) NOT NULL CHECK (credit_type IN ('text_response', 'database_search', 'image_analysis', 'pdf_analysis')),
  credits_charged INTEGER NOT NULL,
  prompt_tokens INTEGER DEFAULT NULL,
  completion_tokens INTEGER DEFAULT NULL,
  total_tokens INTEGER DEFAULT NULL,
  openai_model VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying usage by tenant and time period
CREATE INDEX idx_ai_credit_log_tenant_created ON ai_credit_log (tenant_id, created_at);
CREATE INDEX idx_ai_credit_log_conversation ON ai_credit_log (conversation_id);
