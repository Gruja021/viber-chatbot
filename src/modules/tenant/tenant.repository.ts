import { pool } from '../../config/database';
import { Tenant, CreateTenantInput, UpdateTenantInput } from './tenant.model';
import { encrypt } from '../../utils/crypto';

export const tenantRepository = {
  async findAll(): Promise<Tenant[]> {
    const { rows } = await pool.query<Tenant>(
      'SELECT * FROM tenants ORDER BY created_at DESC'
    );
    return rows;
  },

  async findById(id: string): Promise<Tenant | null> {
    const { rows } = await pool.query<Tenant>(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  async findBySlug(slug: string): Promise<Tenant | null> {
    const { rows } = await pool.query<Tenant>(
      'SELECT * FROM tenants WHERE slug = $1 AND status = $2',
      [slug, 'active']
    );
    return rows[0] || null;
  },

  async create(input: CreateTenantInput): Promise<Tenant> {
    const encryptedCreds = input.database_credentials
      ? encrypt(input.database_credentials)
      : null;

    const { rows } = await pool.query<Tenant>(
      `INSERT INTO tenants (slug, firm_name, viber_auth_token, database_type,
        database_credentials, system_prompt, chatwoot_account_id,
        chatwoot_inbox_id, chatwoot_api_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.slug,
        input.firm_name,
        input.viber_auth_token,
        input.database_type || null,
        encryptedCreds,
        input.system_prompt || 'You are a helpful customer support assistant.',
        input.chatwoot_account_id || null,
        input.chatwoot_inbox_id || null,
        input.chatwoot_api_token || null,
      ]
    );
    return rows[0];
  },

  async update(id: string, input: UpdateTenantInput): Promise<Tenant | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.slug !== undefined) {
      fields.push(`slug = $${idx++}`);
      values.push(input.slug);
    }
    if (input.firm_name !== undefined) {
      fields.push(`firm_name = $${idx++}`);
      values.push(input.firm_name);
    }
    if (input.viber_auth_token !== undefined) {
      fields.push(`viber_auth_token = $${idx++}`);
      values.push(input.viber_auth_token);
    }
    if (input.database_type !== undefined) {
      fields.push(`database_type = $${idx++}`);
      values.push(input.database_type);
    }
    if (input.database_credentials !== undefined) {
      fields.push(`database_credentials = $${idx++}`);
      values.push(encrypt(input.database_credentials));
    }
    if (input.system_prompt !== undefined) {
      fields.push(`system_prompt = $${idx++}`);
      values.push(input.system_prompt);
    }
    if (input.chatwoot_account_id !== undefined) {
      fields.push(`chatwoot_account_id = $${idx++}`);
      values.push(input.chatwoot_account_id);
    }
    if (input.chatwoot_inbox_id !== undefined) {
      fields.push(`chatwoot_inbox_id = $${idx++}`);
      values.push(input.chatwoot_inbox_id);
    }
    if (input.chatwoot_api_token !== undefined) {
      fields.push(`chatwoot_api_token = $${idx++}`);
      values.push(input.chatwoot_api_token);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(input.status);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query<Tenant>(
      `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async deactivate(id: string): Promise<Tenant | null> {
    const { rows } = await pool.query<Tenant>(
      `UPDATE tenants SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },
};
