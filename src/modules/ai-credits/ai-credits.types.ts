export type CreditType = 'text_response' | 'database_search' | 'image_analysis' | 'pdf_analysis';

export const CREDIT_WEIGHTS: Record<CreditType, number> = {
  text_response: 1,
  database_search: 2,
  image_analysis: 5,
  pdf_analysis: 10,
};

export interface CreditCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface CreditLogEntry {
  id: string;
  tenant_id: string;
  conversation_id: string;
  credit_type: CreditType;
  credits_charged: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  openai_model: string | null;
  created_at: Date;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageSummary {
  tenant_id: string;
  monthly_credit_limit: number | null;
  credits_used: number;
  bonus_credits: number;
  credits_remaining: number | null;
  credits_reset_at: Date | null;
  per_conversation_message_limit: number | null;
  breakdown: {
    credit_type: CreditType;
    total_credits: number;
    count: number;
  }[];
}
