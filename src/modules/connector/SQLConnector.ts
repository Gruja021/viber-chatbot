import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import { logger } from '../../config/logger';
import { IDataConnector, ConnectorQueryResult, SQLCredentials } from './connector.types';

type SQLDialect = 'postgresql' | 'mysql';

const FORBIDDEN_PATTERN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

export class SQLConnector implements IDataConnector {
  private credentials: SQLCredentials;
  private dialect: SQLDialect;

  constructor(credentials: SQLCredentials, dialect: SQLDialect) {
    this.credentials = credentials;
    this.dialect = dialect;
  }

  static validateReadOnly(sql: string): boolean {
    return !FORBIDDEN_PATTERN.test(sql);
  }

  async query(searchTerm: string): Promise<ConnectorQueryResult> {
    const { table_name, search_columns } = this.credentials;

    // Validate table and column names (alphanumeric + underscore only)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table_name)) {
      return this.errorResult(searchTerm, 'Invalid table name');
    }
    for (const col of search_columns) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
        return this.errorResult(searchTerm, 'Invalid column name');
      }
    }

    try {
      if (this.dialect === 'postgresql') {
        return await this.queryPostgres(searchTerm);
      } else {
        return await this.queryMySQL(searchTerm);
      }
    } catch (err) {
      logger.error({ err, dialect: this.dialect }, 'SQL query failed');
      return this.errorResult(searchTerm, 'Query execution failed');
    }
  }

  private getSslConfig(): false | { rejectUnauthorized: boolean } {
    return this.credentials.ssl === false ? false : { rejectUnauthorized: false };
  }

  private async queryPostgres(searchTerm: string): Promise<ConnectorQueryResult> {
    const { host, port, database, user, password, table_name, search_columns } = this.credentials;
    const pool = new PgPool({ host, port, database, user, password, max: 1, ssl: this.getSslConfig() });

    try {
      const conditions = search_columns.map((col, i) => `"${col}" ILIKE $1`).join(' OR ');
      const sql = `SELECT * FROM "${table_name}" WHERE ${conditions} LIMIT 10`;

      if (!SQLConnector.validateReadOnly(sql)) {
        return this.errorResult(searchTerm, 'Query validation failed');
      }

      const { rows } = await pool.query(sql, [`%${searchTerm}%`]);
      return {
        success: true,
        data: rows,
        total_results: rows.length,
        source: 'postgresql',
        query_description: `Search for "${searchTerm}" in ${table_name}`,
      };
    } finally {
      await pool.end();
    }
  }

  private async queryMySQL(searchTerm: string): Promise<ConnectorQueryResult> {
    const { host, port, database, user, password, table_name, search_columns } = this.credentials;
    const connection = await mysql.createConnection({ host, port, database, user, password });

    try {
      const conditions = search_columns.map((col) => `LOWER(\`${col}\`) LIKE ?`).join(' OR ');
      const sql = `SELECT * FROM \`${table_name}\` WHERE ${conditions} LIMIT 10`;

      if (!SQLConnector.validateReadOnly(sql)) {
        return this.errorResult(searchTerm, 'Query validation failed');
      }

      const params = search_columns.map(() => `%${searchTerm.toLowerCase()}%`);
      const [rows] = await connection.execute(sql, params);
      const data = rows as Record<string, unknown>[];

      return {
        success: true,
        data,
        total_results: data.length,
        source: 'mysql',
        query_description: `Search for "${searchTerm}" in ${table_name}`,
      };
    } finally {
      await connection.end();
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.dialect === 'postgresql') {
        const pool = new PgPool({
          host: this.credentials.host,
          port: this.credentials.port,
          database: this.credentials.database,
          user: this.credentials.user,
          password: this.credentials.password,
          max: 1,
          ssl: this.getSslConfig(),
        });
        try {
          await pool.query('SELECT 1');
          return true;
        } finally {
          await pool.end();
        }
      } else {
        const connection = await mysql.createConnection({
          host: this.credentials.host,
          port: this.credentials.port,
          database: this.credentials.database,
          user: this.credentials.user,
          password: this.credentials.password,
        });
        try {
          await connection.execute('SELECT 1');
          return true;
        } finally {
          await connection.end();
        }
      }
    } catch {
      return false;
    }
  }

  private errorResult(searchTerm: string, reason: string): ConnectorQueryResult {
    return {
      success: false,
      data: [],
      total_results: 0,
      source: this.dialect,
      query_description: `Search for "${searchTerm}" failed: ${reason}`,
    };
  }
}
