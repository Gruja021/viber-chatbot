import { SQLConnector } from '../SQLConnector';

// Mock pg
jest.mock('pg', () => {
  const mockQuery = jest.fn();
  const mockEnd = jest.fn();
  return {
    Pool: jest.fn().mockImplementation(() => ({
      query: mockQuery,
      end: mockEnd,
    })),
    __mockQuery: mockQuery,
    __mockEnd: mockEnd,
  };
});

// Mock mysql2/promise
jest.mock('mysql2/promise', () => {
  const mockExecute = jest.fn();
  const mockEnd = jest.fn();
  return {
    createConnection: jest.fn().mockResolvedValue({
      execute: mockExecute,
      end: mockEnd,
    }),
    __mockExecute: mockExecute,
    __mockEnd: mockEnd,
  };
});

const { __mockQuery: pgMockQuery, __mockEnd: pgMockEnd } = jest.requireMock('pg');
const { __mockExecute: mysqlMockExecute, __mockEnd: mysqlMockEnd } = jest.requireMock('mysql2/promise');

const baseCreds = {
  host: 'localhost',
  port: 5432,
  database: 'testdb',
  user: 'user',
  password: 'pass',
  table_name: 'products',
  search_columns: ['name', 'description'],
};

describe('SQLConnector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateReadOnly', () => {
    it('allows SELECT queries', () => {
      expect(SQLConnector.validateReadOnly('SELECT * FROM products')).toBe(true);
    });

    it.each([
      'INSERT INTO products VALUES (1)',
      'UPDATE products SET name = "x"',
      'DELETE FROM products',
      'DROP TABLE products',
      'ALTER TABLE products ADD col INT',
      'TRUNCATE TABLE products',
      'GRANT ALL ON products TO user',
      'EXECUTE sp_help',
    ])('rejects dangerous query: %s', (sql) => {
      expect(SQLConnector.validateReadOnly(sql)).toBe(false);
    });
  });

  describe('PostgreSQL query', () => {
    it('executes ILIKE search and returns results', async () => {
      const connector = new SQLConnector(baseCreds, 'postgresql');
      pgMockQuery.mockResolvedValue({
        rows: [{ name: 'Widget', description: 'A great widget', price: 10 }],
      });

      const result = await connector.query('widget');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(1);
      expect(result.data[0].name).toBe('Widget');
      expect(result.source).toBe('postgresql');

      expect(pgMockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        ['%widget%']
      );
      expect(pgMockEnd).toHaveBeenCalled();
    });

    it('handles query error', async () => {
      const connector = new SQLConnector(baseCreds, 'postgresql');
      pgMockQuery.mockRejectedValue(new Error('Connection refused'));

      const result = await connector.query('test');

      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
    });
  });

  describe('MySQL query', () => {
    it('executes LOWER/LIKE search and returns results', async () => {
      const connector = new SQLConnector({ ...baseCreds, port: 3306 }, 'mysql');
      mysqlMockExecute.mockResolvedValue([
        [{ name: 'Gadget', description: 'Cool gadget' }],
      ]);

      const result = await connector.query('gadget');

      expect(result.success).toBe(true);
      expect(result.total_results).toBe(1);
      expect(result.source).toBe('mysql');

      expect(mysqlMockExecute).toHaveBeenCalledWith(
        expect.stringContaining('LOWER'),
        ['%gadget%', '%gadget%']
      );
    });
  });

  describe('input validation', () => {
    it('rejects invalid table name', async () => {
      const connector = new SQLConnector(
        { ...baseCreds, table_name: 'products; DROP TABLE users' },
        'postgresql'
      );

      const result = await connector.query('test');

      expect(result.success).toBe(false);
      expect(pgMockQuery).not.toHaveBeenCalled();
    });

    it('rejects invalid column name', async () => {
      const connector = new SQLConnector(
        { ...baseCreds, search_columns: ['name; DROP TABLE users'] },
        'postgresql'
      );

      const result = await connector.query('test');

      expect(result.success).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('PostgreSQL: returns true on success', async () => {
      const connector = new SQLConnector(baseCreds, 'postgresql');
      pgMockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      expect(await connector.testConnection()).toBe(true);
    });

    it('PostgreSQL: returns false on error', async () => {
      const connector = new SQLConnector(baseCreds, 'postgresql');
      pgMockQuery.mockRejectedValue(new Error('Connection refused'));

      expect(await connector.testConnection()).toBe(false);
    });

    it('MySQL: returns true on success', async () => {
      const connector = new SQLConnector({ ...baseCreds, port: 3306 }, 'mysql');
      mysqlMockExecute.mockResolvedValue([[{ 1: 1 }]]);

      expect(await connector.testConnection()).toBe(true);
    });
  });
});
