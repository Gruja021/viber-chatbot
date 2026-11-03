import { GoogleSheetsConnector } from '../GoogleSheetsConnector';
import { google } from 'googleapis';

jest.mock('googleapis', () => {
  const mockGet = jest.fn();
  const mockSpreadsheetsGet = jest.fn();
  return {
    google: {
      auth: {
        GoogleAuth: jest.fn().mockImplementation(() => ({})),
      },
      sheets: jest.fn().mockReturnValue({
        spreadsheets: {
          values: { get: mockGet },
          get: mockSpreadsheetsGet,
        },
      }),
    },
    __mockValuesGet: mockGet,
    __mockSpreadsheetsGet: mockSpreadsheetsGet,
  };
});

const { __mockValuesGet: mockValuesGet, __mockSpreadsheetsGet: mockSpreadsheetsGet } =
  jest.requireMock('googleapis');

const creds = {
  spreadsheet_id: 'sheet-123',
  sheet_name: 'Products',
  service_account_key: { client_email: 'test@test.iam.gserviceaccount.com', private_key: 'key' },
};

describe('GoogleSheetsConnector', () => {
  let connector: GoogleSheetsConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new GoogleSheetsConnector(creds);
  });

  describe('query', () => {
    it('returns matching rows', async () => {
      mockValuesGet.mockResolvedValue({
        data: {
          values: [
            ['Name', 'Price', 'Category'],
            ['Widget A', '10.00', 'Tools'],
            ['Gadget B', '25.00', 'Electronics'],
            ['Widget C', '15.00', 'Tools'],
          ],
        },
      });

      const result = await connector.query('widget');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(2);
      expect(result.data[0]).toEqual({ name: 'Widget A', price: '10.00', category: 'Tools' });
      expect(result.data[1]).toEqual({ name: 'Widget C', price: '15.00', category: 'Tools' });
      expect(result.source).toBe('google_sheets');
    });

    it('returns empty results when no match', async () => {
      mockValuesGet.mockResolvedValue({
        data: {
          values: [
            ['Name', 'Price'],
            ['Widget A', '10.00'],
          ],
        },
      });

      const result = await connector.query('nonexistent');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('returns empty when spreadsheet has only headers', async () => {
      mockValuesGet.mockResolvedValue({
        data: { values: [['Name', 'Price']] },
      });

      const result = await connector.query('test');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(0);
    });

    it('handles API error gracefully', async () => {
      mockValuesGet.mockRejectedValue(new Error('API quota exceeded'));

      const result = await connector.query('test');

      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('limits results to 10', async () => {
      const rows = [['Name']];
      for (let i = 0; i < 20; i++) {
        rows.push([`Item ${i}`]);
      }
      mockValuesGet.mockResolvedValue({ data: { values: rows } });

      const result = await connector.query('Item');
      expect(result.total_results).toBe(10);
    });
  });

  describe('testConnection', () => {
    it('returns true on success', async () => {
      mockSpreadsheetsGet.mockResolvedValue({ data: {} });
      expect(await connector.testConnection()).toBe(true);
    });

    it('returns false on error', async () => {
      mockSpreadsheetsGet.mockRejectedValue(new Error('Not found'));
      expect(await connector.testConnection()).toBe(false);
    });
  });
});
