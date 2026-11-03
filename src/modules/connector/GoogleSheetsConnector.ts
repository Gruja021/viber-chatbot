import { google } from 'googleapis';
import { logger } from '../../config/logger';
import { IDataConnector, ConnectorQueryResult, GoogleSheetsCredentials } from './connector.types';

export class GoogleSheetsConnector implements IDataConnector {
  private credentials: GoogleSheetsCredentials;

  constructor(credentials: GoogleSheetsCredentials) {
    this.credentials = credentials;
  }

  private getAuth() {
    return new google.auth.GoogleAuth({
      credentials: this.credentials.service_account_key as any,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }

  async query(searchTerm: string): Promise<ConnectorQueryResult> {
    try {
      const auth = this.getAuth();
      const sheets = google.sheets({ version: 'v4', auth });

      const sheetName = this.credentials.sheet_name || 'Sheet1';
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.credentials.spreadsheet_id,
        range: `${sheetName}!A1:Z1000`,
      });

      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        return {
          success: true,
          data: [],
          total_results: 0,
          source: 'google_sheets',
          query_description: `Search for "${searchTerm}" in Google Sheets`,
        };
      }

      const headers = rows[0].map((h: string) => String(h).toLowerCase().trim());
      const dataRows = rows.slice(1);

      const term = searchTerm.toLowerCase();
      const matched = dataRows
        .filter((row) =>
          row.some((cell: unknown) => String(cell).toLowerCase().includes(term))
        )
        .slice(0, 10)
        .map((row) => {
          const obj: Record<string, unknown> = {};
          headers.forEach((header: string, i: number) => {
            obj[header] = row[i] ?? null;
          });
          return obj;
        });

      return {
        success: true,
        data: matched,
        total_results: matched.length,
        source: 'google_sheets',
        query_description: `Search for "${searchTerm}" in Google Sheets`,
      };
    } catch (err) {
      logger.error({ err }, 'Google Sheets query failed');
      return {
        success: false,
        data: [],
        total_results: 0,
        source: 'google_sheets',
        query_description: `Search for "${searchTerm}" in Google Sheets (failed)`,
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const auth = this.getAuth();
      const sheets = google.sheets({ version: 'v4', auth });
      await sheets.spreadsheets.get({
        spreadsheetId: this.credentials.spreadsheet_id,
      });
      return true;
    } catch {
      return false;
    }
  }
}
