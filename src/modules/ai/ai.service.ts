import OpenAI from 'openai';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { Tenant } from '../tenant/tenant.model';
import { Message } from '../conversation/conversation.model';
import { createConnector } from '../connector/connector.factory';
import { ANTI_HALLUCINATION_PREFIX, NO_DATABASE_SUFFIX } from './ai.prompts';
import { AIResponse } from './ai.types';

const MODEL = 'gpt-4o-mini';
const MAX_FUNCTION_CALLS = 3;

const SEARCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_database',
    description: 'Search the business database for products, services, or other information.',
    parameters: {
      type: 'object',
      properties: {
        search_term: {
          type: 'string',
          description: 'The search term to look up in the database',
        },
      },
      required: ['search_term'],
    },
  },
};

const ESCALATE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'escalate_to_human',
    description: 'Escalate to a human agent when you cannot resolve the issue, need to check with colleagues, or the customer requests to speak with a person.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'The reason for escalation',
        },
      },
      required: ['reason'],
    },
  },
};

function buildSystemMessage(tenant: Tenant, hasConnector: boolean): string {
  let prompt = ANTI_HALLUCINATION_PREFIX;
  if (tenant.system_prompt) {
    prompt += '\n\n' + tenant.system_prompt;
  }
  if (!hasConnector) {
    prompt += NO_DATABASE_SUFFIX;
  }
  return prompt;
}

function formatMessages(
  systemMessage: string,
  history: Message[],
  userMessage: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemMessage },
  ];

  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}

function buildTools(hasConnector: boolean, hasChatwoot: boolean): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
  if (hasConnector) tools.push(SEARCH_TOOL);
  if (hasChatwoot) tools.push(ESCALATE_TOOL);
  return tools.length > 0 ? tools : undefined;
}

export const aiService = {
  async generateResponse(
    tenant: Tenant,
    conversationHistory: Message[],
    userMessage: string
  ): Promise<AIResponse> {
    try {
      const client = new OpenAI({ apiKey: tenant.openai_api_key || env.OPENAI_API_KEY });
      const connector = createConnector(tenant);
      const hasConnector = connector !== null;
      logger.info({ tenantId: tenant.id, hasConnector, hasDatabaseType: !!tenant.database_type, hasCreds: !!tenant.database_credentials }, 'AI connector status');
      const hasChatwoot = !!(tenant.chatwoot_api_token);

      const systemMessage = buildSystemMessage(tenant, hasConnector);
      const messages = formatMessages(systemMessage, conversationHistory, userMessage);
      const tools = buildTools(hasConnector, hasChatwoot);

      const model = tenant.openai_model || MODEL;

      let response = await client.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: 1024,
        messages,
        tools,
      });

      logger.info({ tenantId: tenant.id, finishReason: response.choices[0]?.finish_reason, hasToolCalls: !!response.choices[0]?.message?.tool_calls, content: response.choices[0]?.message?.content?.substring(0, 100) }, 'AI initial response');

      let functionCallCount = 0;

      while (
        response.choices[0]?.finish_reason === 'tool_calls' &&
        response.choices[0].message.tool_calls &&
        functionCallCount < MAX_FUNCTION_CALLS
      ) {
        const toolCalls = response.choices[0].message.tool_calls;
        messages.push(response.choices[0].message);

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;

          if (toolCall.function.name === 'escalate_to_human') {
            const args = JSON.parse(toolCall.function.arguments);
            return {
              text: 'Za ovo pitanje bi bilo najbolje da proverim sa kolegama. Prosleđujem vaš zahtev našem timu.',
              shouldEscalate: true,
              escalationReason: args.reason,
            };
          }

          if (toolCall.function.name === 'search_database' && connector) {
            const args = JSON.parse(toolCall.function.arguments);
            logger.info({ searchTerm: args.search_term, tenantId: tenant.id }, 'AI calling search_database');
            const result = await connector.query(args.search_term);
            logger.info({ searchTerm: args.search_term, totalResults: result.total_results, success: result.success, tenantId: tenant.id }, 'search_database result');

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });

            functionCallCount++;
          }
        }

        response = await client.chat.completions.create({
          model,
          temperature: 0.3,
          max_tokens: 1024,
          messages,
          tools,
        });
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        logger.warn({ tenantId: tenant.id }, 'AI returned empty response');
        return {
          text: 'Извините, nisam uspeo da generišem odgovor. Pokušajte ponovo.',
          shouldEscalate: false,
        };
      }

      return { text: content, shouldEscalate: false };
    } catch (err: any) {
      logger.error({ err, tenantId: tenant.id }, 'AI response generation failed');

      if (err?.status === 429) {
        return {
          text: 'Trenutno imam povećan broj zahteva. Molim vas pokušajte ponovo za koji minut.',
          shouldEscalate: false,
        };
      }

      return {
        text: 'Došlo je do greške prilikom obrade vaše poruke. Pokušajte ponovo kasnije.',
        shouldEscalate: false,
      };
    }
  },
};
