import OpenAI from 'openai';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { Tenant } from '../tenant/tenant.model';
import { Message } from '../conversation/conversation.model';
import { createConnector, createConnectorsForTenant } from '../connector/connector.factory';
import { connectorRepository } from '../connector/connector.repository';
import { IDataConnector, TenantConnector, NamedConnectorQueryResult } from '../connector/connector.types';
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

function buildSearchTool(connectorConfigs: TenantConnector[]): OpenAI.Chat.Completions.ChatCompletionTool {
  const sourceNames = connectorConfigs.map(c => c.name);
  const sourceDescriptions = connectorConfigs
    .map(c => `- "${c.name}": ${c.description || c.database_type}`)
    .join('\n');

  return {
    type: 'function',
    function: {
      name: 'search_database',
      description: `Search business data sources for products, services, or other information.\n\nAvailable sources:\n${sourceDescriptions}\n\nOmit "source" to search all sources.`,
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'The search term to look up',
          },
          source: {
            type: 'string',
            description: 'Specific data source to search. Omit to search all.',
            enum: sourceNames,
          },
        },
        required: ['search_term'],
      },
    },
  };
}

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

function buildTools(
  hasConnector: boolean,
  hasChatwoot: boolean,
  searchTool?: OpenAI.Chat.Completions.ChatCompletionTool,
): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
  if (hasConnector) tools.push(searchTool || SEARCH_TOOL);
  if (hasChatwoot) tools.push(ESCALATE_TOOL);
  return tools.length > 0 ? tools : undefined;
}

async function executeSearch(
  searchTerm: string,
  source: string | undefined,
  connectorMap: Map<string, IDataConnector>,
): Promise<NamedConnectorQueryResult[]> {
  if (source && connectorMap.has(source)) {
    const connector = connectorMap.get(source)!;
    const result = await connector.query(searchTerm);
    return [{ ...result, connector_name: source }];
  }

  // Search all connectors
  const results: NamedConnectorQueryResult[] = [];
  for (const [name, connector] of connectorMap) {
    try {
      const result = await connector.query(searchTerm);
      results.push({ ...result, connector_name: name });
    } catch (err) {
      logger.error({ err, connectorName: name }, 'Multi-connector search error');
      results.push({
        success: false,
        data: [],
        total_results: 0,
        source: name,
        query_description: `Error searching ${name}`,
        connector_name: name,
      });
    }
  }
  return results;
}

export const aiService = {
  async generateResponse(
    tenant: Tenant,
    conversationHistory: Message[],
    userMessage: string
  ): Promise<AIResponse> {
    try {
      const client = new OpenAI({ apiKey: tenant.openai_api_key || env.OPENAI_API_KEY });

      // Try multi-connector first, fallback to legacy single connector
      const connectorConfigs = await connectorRepository.findActiveByTenantId(tenant.id);
      let connectorMap: Map<string, IDataConnector>;
      let searchTool: OpenAI.Chat.Completions.ChatCompletionTool | undefined;

      if (connectorConfigs.length > 0) {
        connectorMap = createConnectorsForTenant(connectorConfigs);
        if (connectorConfigs.length > 1) {
          searchTool = buildSearchTool(connectorConfigs);
        }
      } else {
        // Legacy fallback: single connector from tenant fields
        connectorMap = new Map();
        const legacyConnector = createConnector(tenant);
        if (legacyConnector) {
          connectorMap.set('database', legacyConnector);
        }
      }

      const hasConnector = connectorMap.size > 0;
      logger.info({ tenantId: tenant.id, hasConnector, connectorCount: connectorMap.size }, 'AI connector status');
      const hasChatwoot = !!(tenant.chatwoot_api_token);

      const systemMessage = buildSystemMessage(tenant, hasConnector);
      const messages = formatMessages(systemMessage, conversationHistory, userMessage);
      const tools = buildTools(hasConnector, hasChatwoot, searchTool);

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

          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (parseErr) {
            logger.warn({ tenantId: tenant.id, functionName: toolCall.function.name, raw: toolCall.function.arguments }, 'Failed to parse tool call arguments');
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: 'Invalid arguments format' }),
            });
            functionCallCount++;
            continue;
          }

          if (toolCall.function.name === 'escalate_to_human') {
            return {
              text: 'Za ovo pitanje bi bilo najbolje da proverim sa kolegama. Prosleđujem vaš zahtev našem timu.',
              shouldEscalate: true,
              escalationReason: (args.reason as string) || 'unknown',
            };
          }

          if (toolCall.function.name === 'search_database' && hasConnector) {
            const searchTerm = args.search_term as string;
            if (!searchTerm || typeof searchTerm !== 'string') {
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: 'search_term is required and must be a string' }),
              });
              functionCallCount++;
              continue;
            }

            logger.info({ searchTerm, source: args.source, tenantId: tenant.id }, 'AI calling search_database');
            const results = await executeSearch(searchTerm, args.source as string | undefined, connectorMap);
            const totalResults = results.reduce((sum, r) => sum + r.total_results, 0);
            logger.info({ searchTerm, totalResults, resultCount: results.length, tenantId: tenant.id }, 'search_database result');

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(results.length === 1 ? results[0] : results),
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
