-- Add Chatwoot auto-provisioning status tracking
ALTER TABLE tenants
  ADD COLUMN chatwoot_setup_status VARCHAR(20) DEFAULT 'none',
  ADD COLUMN chatwoot_setup_error TEXT;
