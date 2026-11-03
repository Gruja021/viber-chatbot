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

export const aiService = {
  async generateResponse(
    tenant: Tenant,
    conversationHistory: Message[],
    userMessage: string
  ): Promise<string> {
    try {
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const connector = createConnector(tenant);
      const hasConnector = connector !== null;

      const systemMessage = buildSystemMessage(tenant, hasConnector);
      const messages = formatMessages(systemMessage, conversationHistory, userMessage);

      let response = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 1024,
        messages,
        tools: hasConnector ? [SEARCH_TOOL] : undefined,
      });

      let functionCallCount = 0;

      while (
        response.choices[0]?.finish_reason === 'tool_calls' &&
        response.choices[0].message.tool_calls &&
        functionCallCount < MAX_FUNCTION_CALLS
      ) {
        const toolCalls = response.choices[0].message.tool_calls;
        messages.push(response.choices[0].message);

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function' || !connector) continue;
          if (toolCall.function.name === 'search_database') {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await connector.query(args.search_term);

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });

            functionCallCount++;
          }
        }

        response = await client.chat.completions.create({
          model: MODEL,
          temperature: 0.3,
          max_tokens: 1024,
          messages,
          tools: [SEARCH_TOOL],
        });
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        logger.warn({ tenantId: tenant.id }, 'AI returned empty response');
        return 'Izvините, nisam uspeo da generišem odgovor. Pokušajte ponovo.';
      }

      return content;
    } catch (err: any) {
      logger.error({ err, tenantId: tenant.id }, 'AI response generation failed');

      if (err?.status === 429) {
        return 'Trenutno imam povećan broj zahteva. Molim vas pokušajte ponovo za koji minut.';
      }

      return 'Došlo je do greške prilikom obrade vaše poruke. Pokušajte ponovo kasnije.';
    }
  },
};
