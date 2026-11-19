import axios from 'axios';
import { URL } from 'url';
import { logger } from '../../config/logger';
import { IDataConnector, ConnectorQueryResult, RestAPICredentials } from './connector.types';

/**
 * Check if a hostname resolves to a private/internal IP range.
 * Blocks SSRF attacks against internal services.
 */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return true;
    }

    // Block private IP ranges
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10) return true;                          // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
      if (a === 192 && b === 168) return true;             // 192.168.0.0/16
      if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (link-local)
      if (a === 0) return true;                            // 0.0.0.0/8
      if (a === 127) return true;                          // 127.0.0.0/8
    }

    // Block IPv6 private ranges in brackets
    if (hostname.startsWith('[')) return true;

    // Block .local, .internal domains
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;

    return false;
  } catch {
    return true; // Invalid URL = block
  }
}

export class RestAPIConnector implements IDataConnector {
  private credentials: RestAPICredentials;

  constructor(credentials: RestAPICredentials) {
    if (isPrivateUrl(credentials.base_url)) {
      throw new Error('SSRF protection: cannot connect to private/internal URLs');
    }
    this.credentials = credentials;
  }

  private getClient() {
    return axios.create({
      baseURL: this.credentials.base_url,
      headers: this.credentials.headers || {},
      timeout: 10000,
      maxRedirects: 0, // Prevent redirect-based SSRF
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
