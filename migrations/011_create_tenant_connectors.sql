-- Multi-connector support: allows tenants to have multiple data sources
CREATE TABLE tenant_connectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    database_type database_type NOT NULL,
    database_credentials BYTEA NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_tenant_connectors_tenant_id ON tenant_connectors(tenant_id);

-- Migrate existing tenant data sources into the new table
INSERT INTO tenant_connectors (tenant_id, name, database_type, database_credentials)
SELECT id,
       CASE database_type
         WHEN 'google_sheets' THEN 'data'
         WHEN 'woocommerce' THEN 'products'
         WHEN 'rest_api' THEN 'api'
         ELSE 'database'
       END,
       database_type, database_credentials
FROM tenants
WHERE database_type IS NOT NULL AND database_credentials IS NOT NULL;
