import { WooCommerceConnector } from '../WooCommerceConnector';
import axios from 'axios';

jest.mock('axios');

const mockAxiosInstance = {
  get: jest.fn(),
};

(axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

const creds = {
  store_url: 'https://shop.test',
  consumer_key: 'ck_test',
  consumer_secret: 'cs_test',
};

describe('WooCommerceConnector', () => {
  let connector: WooCommerceConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);
    connector = new WooCommerceConnector(creds);
  });

  describe('query', () => {
    it('returns mapped products', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: [
          {
            name: 'Test Product',
            price: '29.99',
            regular_price: '39.99',
            sale_price: '29.99',
            stock_status: 'instock',
            sku: 'TP-001',
            permalink: 'https://shop.test/product/test',
            short_description: '<p>A great product</p>',
          },
        ],
      });

      const result = await connector.query('test');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(1);
      expect(result.data[0]).toEqual({
        name: 'Test Product',
        price: '29.99',
        regular_price: '39.99',
        sale_price: '29.99',
        stock_status: 'instock',
        sku: 'TP-001',
        permalink: 'https://shop.test/product/test',
        short_description: 'A great product',
      });
      expect(result.source).toBe('woocommerce');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/wp-json/wc/v3/products', {
        params: { search: 'test', per_page: 10 },
      });
    });

    it('returns empty on no results', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await connector.query('nonexistent');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('handles network error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network Error'));

      const result = await connector.query('test');

      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('strips HTML from short_description', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: [
          {
            name: 'P',
            price: '10',
            regular_price: '10',
            sale_price: '',
            stock_status: 'instock',
            sku: '',
            permalink: '',
            short_description: '<strong>Bold</strong> and <em>italic</em>',
          },
        ],
      });

      const result = await connector.query('P');
      expect(result.data[0].short_description).toBe('Bold and italic');
    });
  });

  describe('testConnection', () => {
    it('returns true on success', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });
      expect(await connector.testConnection()).toBe(true);
    });

    it('returns false on error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Unauthorized'));
      expect(await connector.testConnection()).toBe(false);
    });
  });
});
