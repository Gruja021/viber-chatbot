import axios from 'axios';
import { logger } from '../../config/logger';
import {
  ChatwootCreateInboxOptions,
  ChatwootCreateInboxResult,
  ChatwootAddAgentToInboxOptions,
} from './chatwoot.types';

const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'http://localhost:3000';

export interface ChatwootAgent {
  id: number;
  name: string;
  email: string;
  role: string;
}

export const chatwootProvisioningService = {
  async createInbox(options: ChatwootCreateInboxOptions): Promise<ChatwootCreateInboxResult> {
    try {
      const response = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${options.chatwootAccountId}/inboxes`,
        {
          name: options.name,
          channel: {
            type: options.channelType || 'api',
          },
        },
        {
          headers: {
            'api_access_token': options.chatwootApiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const inbox: ChatwootCreateInboxResult = {
        id: response.data.id,
        name: response.data.name,
        channel_type: response.data.channel_type,
      };

      logger.info({ inboxId: inbox.id, name: inbox.name }, 'Chatwoot inbox created');
      return inbox;
    } catch (err) {
      logger.error({ err }, 'Failed to create Chatwoot inbox');
      throw err;
    }
  },

  async addAgentsToInbox(options: ChatwootAddAgentToInboxOptions): Promise<void> {
    try {
      await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${options.chatwootAccountId}/inbox_members`,
        {
          inbox_id: options.inboxId,
          user_ids: options.agentIds,
        },
        {
          headers: {
            'api_access_token': options.chatwootApiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(
        { inboxId: options.inboxId, agentCount: options.agentIds.length },
        'Agents added to Chatwoot inbox'
      );
    } catch (err) {
      logger.error({ err }, 'Failed to add agents to Chatwoot inbox');
      throw err;
    }
  },

  async createAgent(
    chatwootApiToken: string,
    chatwootAccountId: number,
    name: string,
    email: string
  ): Promise<ChatwootAgent> {
    try {
      const response = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${chatwootAccountId}/agents`,
        { name, email, role: 'agent' },
        {
          headers: {
            'api_access_token': chatwootApiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const agent: ChatwootAgent = {
        id: response.data.id,
        name: response.data.name,
        email: response.data.email,
        role: response.data.role,
      };

      logger.info({ agentId: agent.id, name: agent.name }, 'Chatwoot agent created');
      return agent;
    } catch (err) {
      logger.error({ err }, 'Failed to create Chatwoot agent');
      throw err;
    }
  },

  async listInboxAgents(
    chatwootApiToken: string,
    chatwootAccountId: number,
    inboxId: number
  ): Promise<ChatwootAgent[]> {
    try {
      const response = await axios.get(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${chatwootAccountId}/inbox_members/${inboxId}`,
        {
          headers: {
            'api_access_token': chatwootApiToken,
          },
        }
      );

      return response.data.payload || response.data;
    } catch (err) {
      logger.error({ err }, 'Failed to list inbox agents');
      throw err;
    }
  },

  async removeAgentFromInbox(
    chatwootApiToken: string,
    chatwootAccountId: number,
    inboxId: number,
    agentIds: number[]
  ): Promise<void> {
    try {
      await axios.delete(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${chatwootAccountId}/inbox_members`,
        {
          data: {
            inbox_id: inboxId,
            user_ids: agentIds,
          },
          headers: {
            'api_access_token': chatwootApiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(
        { inboxId, agentIds },
        'Agent(s) removed from Chatwoot inbox'
      );
    } catch (err) {
      logger.error({ err }, 'Failed to remove agent from Chatwoot inbox');
      throw err;
    }
  },

  async listAgents(chatwootApiToken: string, chatwootAccountId: number): Promise<ChatwootAgent[]> {
    try {
      const response = await axios.get(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${chatwootAccountId}/agents`,
        {
          headers: {
            'api_access_token': chatwootApiToken,
          },
        }
      );

      return response.data;
    } catch (err) {
      logger.error({ err }, 'Failed to list Chatwoot agents');
      throw err;
    }
  },
};
