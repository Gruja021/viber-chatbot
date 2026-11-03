CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    viber_user_id VARCHAR(255) NOT NULL,
    viber_user_name VARCHAR(255),
    chatwoot_conversation_id INTEGER,
    is_handover BOOLEAN NOT NULL DEFAULT FALSE,
    handover_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, viber_user_id)
);

CREATE INDEX idx_conversations_tenant_id ON conversations (tenant_id);
CREATE INDEX idx_conversations_viber_user ON conversations (tenant_id, viber_user_id);
