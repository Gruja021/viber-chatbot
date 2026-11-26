export interface AIResponse {
  text: string;
  shouldEscalate: boolean;
  escalationReason?: string;
  usedDatabaseSearch: boolean;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
