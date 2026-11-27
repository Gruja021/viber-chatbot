-- Change encrypted token columns from VARCHAR to BYTEA
-- These columns store AES-256-GCM encrypted binary data, not plain text

ALTER TABLE tenants ALTER COLUMN viber_auth_token TYPE BYTEA USING viber_auth_token::BYTEA;
ALTER TABLE tenants ALTER COLUMN telegram_bot_token TYPE BYTEA USING telegram_bot_token::BYTEA;
ALTER TABLE tenants ALTER COLUMN openai_api_key TYPE BYTEA USING openai_api_key::BYTEA;
ALTER TABLE tenants ALTER COLUMN chatwoot_api_token TYPE BYTEA USING chatwoot_api_token::BYTEA;
