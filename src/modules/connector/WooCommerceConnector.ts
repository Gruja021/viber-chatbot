import axios from 'axios';
import { logger } from '../../config/logger';
import { IDataConnector, ConnectorQueryResult, WooCommerceCredentials } from './connector.types';

export class WooCommerceConnector implements IDataConnector {
  private credentials: WooCommerceCredentials;

  constructor(credentials: WooCommerceCredentials) {
    this.credentials = credentials;
  }

  private getClient() {
    return axios.create({
      baseURL: this.credentials.store_url,
      auth: {
        username: this.credentials.consumer_key,
        password: this.credentials.consumer_secret,
      },
      timeout: 10000,
    });
  }

  async query(searchTerm: string): Promise<ConnectorQueryResult> {
    try {
      const client = this.getClient();
      const response = await client.get('/wp-json/wc/v3/products', {
        params: {
          search: searchTerm,
          per_page: 10,
        },
      });

      const products = response.data.map((p: any) => ({
        name: p.name,
        price: p.price,
        regular_price: p.regular_price,
        sale_price: p.sale_price,
        stock_status: p.stock_status,
        sku: p.sku,
        permalink: p.permalink,
        short_description: p.short_description?.replace(/<[^>]*>/g, '') || '',
      }));

      return {
        success: true,
        data: products,
        total_results: products.length,
        source: 'woocommerce',
        query_description: `Search for "${searchTerm}" in WooCommerce products`,
      };
    } catch (err) {
      logger.error({ err }, 'WooCommerce query failed');
      return {
        success: false,
        data: [],
        total_results: 0,
        source: 'woocommerce',
        query_description: `Search for "${searchTerm}" in WooCommerce products (failed)`,
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.get('/wp-json/wc/v3/system_status');
      return true;
    } catch {
      return false;
    }
  }
}
