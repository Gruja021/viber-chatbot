-- Migration 006: Add Telegram support
-- Make the platform agnostic: viber_user_id → platform_user_id, etc.

-- 1. Add telegram_bot_token to tenants
ALTER TABLE tenants ADD COLUMN telegram_bot_token VARCHAR(255);

-- 2. Make viber_auth_token nullable (tenant may have only Telegram)
ALTER TABLE tenants ALTER COLUMN viber_auth_token DROP NOT NULL;

-- Drop the unique constraint on viber_auth_token (it can now be NULL)
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_viber_auth_token_key;

-- 3. Add platform columns to conversations
ALTER TABLE conversations ADD COLUMN platform VARCHAR(20) NOT NULL DEFAULT 'viber';
ALTER TABLE conversations ADD COLUMN platform_user_id VARCHAR(255);
ALTER TABLE conversations ADD COLUMN platform_user_name VARCHAR(255);

-- 4. Backfill from existing viber columns
UPDATE conversations SET platform_user_id = viber_user_id, platform_user_name = viber_user_name;

-- 5. Make platform_user_id NOT NULL after backfill
ALTER TABLE conversations ALTER COLUMN platform_user_id SET NOT NULL;

-- 6. Drop old unique constraint and create new one
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_tenant_id_viber_user_id_key;
ALTER TABLE conversations ADD CONSTRAINT conversations_tenant_platform_user_unique
  UNIQUE (tenant_id, platform, platform_user_id);

-- 7. Drop old viber-specific columns
ALTER TABLE conversations DROP COLUMN viber_user_id;
ALTER TABLE conversations DROP COLUMN viber_user_name;

-- 8. Rename viber_message_token to platform_message_id in messages
ALTER TABLE messages RENAME COLUMN viber_message_token TO platform_message_id;
-- Change type from BIGINT to VARCHAR to support Telegram's string-based message IDs
ALTER TABLE messages ALTER COLUMN platform_message_id TYPE VARCHAR(255) USING platform_message_id::VARCHAR;

-- 9. Update indexes
DROP INDEX IF EXISTS idx_conversations_viber_user;
CREATE INDEX idx_conversations_platform_user ON conversations (tenant_id, platform, platform_user_id);
