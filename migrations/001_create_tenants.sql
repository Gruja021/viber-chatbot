CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE tenant_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE database_type AS ENUM ('google_sheets', 'woocommerce', 'postgresql', 'mysql');

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(63) NOT NULL UNIQUE,
    firm_name VARCHAR(255) NOT NULL,
    viber_auth_token VARCHAR(255) NOT NULL UNIQUE,
    database_type database_type,
    database_credentials BYTEA,
    system_prompt TEXT NOT NULL DEFAULT 'You are a helpful customer support assistant.',
    chatwoot_account_id INTEGER,
    chatwoot_inbox_id INTEGER,
    chatwoot_api_token VARCHAR(255),
    status tenant_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants (slug);
CREATE INDEX idx_tenants_status ON tenants (status);
