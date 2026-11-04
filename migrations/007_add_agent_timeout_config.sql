-- Add configurable agent timeout per tenant
-- Default 180s (3 minutes) preserves existing behavior
ALTER TABLE tenants ADD COLUMN agent_timeout_seconds INTEGER NOT NULL DEFAULT 180;
