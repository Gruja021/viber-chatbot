export interface AIResponse {
  text: string;
  shouldEscalate: boolean;
  escalationReason?: string;
}
