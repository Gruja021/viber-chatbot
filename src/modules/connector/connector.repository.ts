import { pool } from '../../config/database';
import { encrypt } from '../../utils/crypto';
import { TenantConnector, CreateConnectorInput, UpdateConnectorInput } from './connector.types';

export const connectorRepository = {
  async findByTenantId(tenantId: string): Promise<TenantConnector[]> {
    const { rows } = await pool.query<TenantConnector>(
      'SELECT * FROM tenant_connectors WHERE tenant_id = $1 ORDER BY priority ASC, created_at ASC',
      [tenantId]
    );
    return rows;
  },

  async findActiveByTenantId(tenantId: string): Promise<TenantConnector[]> {
    const { rows } = await pool.query<TenantConnector>(
      'SELECT * FROM tenant_connectors WHERE tenant_id = $1 AND is_active = true ORDER BY priority ASC, created_at ASC',
      [tenantId]
    );
    return rows;
  },

  async findById(id: string): Promise<TenantConnector | null> {
    const { rows } = await pool.query<TenantConnector>(
      'SELECT * FROM tenant_connectors WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  async create(tenantId: string, input: CreateConnectorInput): Promise<TenantConnector> {
    const encryptedCreds = encrypt(input.database_credentials);
    const { rows } = await pool.query<TenantConnector>(
      `INSERT INTO tenant_connectors (tenant_id, name, description, database_type, database_credentials, is_active, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        input.name,
        input.description || null,
        input.database_type,
        encryptedCreds,
        input.is_active ?? true,
        input.priority ?? 0,
      ]
    );
    return rows[0];
  },

  async update(id: string, input: UpdateConnectorInput): Promise<TenantConnector | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(input.description);
    }
    if (input.database_type !== undefined) {
      fields.push(`database_type = $${idx++}`);
      values.push(input.database_type);
    }
    if (input.database_credentials !== undefined) {
      fields.push(`database_credentials = $${idx++}`);
      values.push(encrypt(input.database_credentials));
    }
    if (input.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(input.is_active);
    }
    if (input.priority !== undefined) {
      fields.push(`priority = $${idx++}`);
      values.push(input.priority);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query<TenantConnector>(
      `UPDATE tenant_connectors SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM tenant_connectors WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
