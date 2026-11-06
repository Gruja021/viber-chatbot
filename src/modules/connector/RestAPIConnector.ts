import axios from 'axios';
import { logger } from '../../config/logger';
import { IDataConnector, ConnectorQueryResult, RestAPICredentials } from './connector.types';

export class RestAPIConnector implements IDataConnector {
  private credentials: RestAPICredentials;

  constructor(credentials: RestAPICredentials) {
    this.credentials = credentials;
  }

  private getClient() {
    return axios.create({
      baseURL: this.credentials.base_url,
      headers: this.credentials.headers || {},
      timeout: 10000,
    });
  }

  private extractResults(data: unknown): Record<string, unknown>[] {
    if (!this.credentials.result_path) {
      return Array.isArray(data) ? data : [];
    }

    const parts = this.credentials.result_path.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return [];
      }
    }

    return Array.isArray(current) ? current : [];
  }

  async query(searchTerm: string): Promise<ConnectorQueryResult> {
    try {
      const client = this.getClient();
      const response = await client.get(this.credentials.search_endpoint, {
        params: {
          [this.credentials.search_param]: searchTerm,
        },
      });

      const results = this.extractResults(response.data).slice(0, 10);

      return {
        success: true,
        data: results as Record<string, unknown>[],
        total_results: results.length,
        source: 'rest_api',
        query_description: `Search for "${searchTerm}" via REST API`,
      };
    } catch (err) {
      logger.error({ err }, 'REST API query failed');
      return {
        success: false,
        data: [],
        total_results: 0,
        source: 'rest_api',
        query_description: `Search for "${searchTerm}" via REST API (failed)`,
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.get(this.credentials.search_endpoint, {
        params: {
          [this.credentials.search_param]: '',
        },
      });
      return true;
    } catch {
      return false;
    }
  }
}
