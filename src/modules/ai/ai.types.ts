export interface AIResponse {
  text: string;
  used_function_calling: boolean;
  function_calls_count: number;
  model: string;
  error?: string;
}
