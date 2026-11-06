import { RestAPIConnector } from '../RestAPIConnector';
import axios from 'axios';

jest.mock('axios');

const mockAxiosInstance = {
  get: jest.fn(),
};

(axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

const creds = {
  base_url: 'https://api.example.com',
  search_endpoint: '/api/offers',
  search_param: 'search',
};

describe('RestAPIConnector', () => {
  let connector: RestAPIConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);
    connector = new RestAPIConnector(creds);
  });

  describe('query', () => {
    it('returns results from root-level array', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: [
          { name: 'Offer A', price: 100 },
          { name: 'Offer B', price: 200 },
        ],
      });

      const result = await connector.query('test');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(2);
      expect(result.data).toEqual([
        { name: 'Offer A', price: 100 },
        { name: 'Offer B', price: 200 },
      ]);
      expect(result.source).toBe('rest_api');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/offers', {
        params: { search: 'test' },
      });
    });

    it('returns results from nested path via result_path', async () => {
      const nestedConnector = new RestAPIConnector({
        ...creds,
        result_path: 'data.items',
      });

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: {
            items: [
              { id: 1, title: 'Item 1' },
              { id: 2, title: 'Item 2' },
            ],
          },
        },
      });

      const result = await nestedConnector.query('item');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(2);
      expect(result.data[0]).toEqual({ id: 1, title: 'Item 1' });
    });

    it('sends custom headers', async () => {
      const headerConnector = new RestAPIConnector({
        ...creds,
        headers: { Authorization: 'Bearer my-token', 'X-Api-Key': 'key123' },
      });

      mockAxiosInstance.get.mockResolvedValue({ data: [] });
      await headerConnector.query('test');

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { Authorization: 'Bearer my-token', 'X-Api-Key': 'key123' },
        }),
      );
    });

    it('returns empty on no results', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await connector.query('nonexistent');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('limits results to 10', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({ id: i }));
      mockAxiosInstance.get.mockResolvedValue({ data: items });

      const result = await connector.query('many');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(10);
    });

    it('handles HTTP error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Request failed with status code 500'));

      const result = await connector.query('test');

      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.total_results).toBe(0);
    });

    it('returns empty array when result_path points to invalid location', async () => {
      const nestedConnector = new RestAPIConnector({
        ...creds,
        result_path: 'nonexistent.path',
      });

      mockAxiosInstance.get.mockResolvedValue({ data: { other: 'data' } });

      const result = await nestedConnector.query('test');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns empty array when response is not an array and no result_path', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { message: 'ok' } });

      const result = await connector.query('test');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('testConnection', () => {
    it('returns true on successful response', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });
      expect(await connector.testConnection()).toBe(true);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/offers', {
        params: { search: '' },
      });
    });

    it('returns false on error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));
      expect(await connector.testConnection()).toBe(false);
    });
  });
});
