import axios from 'axios';
import { logger } from '../../config/logger';
import {
  ChatwootCreateInboxOptions,
  ChatwootCreateInboxResult,
  ChatwootAddAgentToInboxOptions,
  ChatwootCreateAccountResult,
  ChatwootCreateAccountUserResult,
  ChatwootSetupWebhookOptions,
  ChatwootProvisionResult,
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

  // --- Platform API methods (super admin token) ---

  async createAccount(platformToken: string, name: string): Promise<ChatwootCreateAccountResult> {
    try {
      const response = await axios.post(
        `${CHATWOOT_BASE_URL}/platform/api/v1/accounts`,
        { name },
        {
          headers: {
            'api_access_token': platformToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const account: ChatwootCreateAccountResult = {
        id: response.data.id,
        name: response.data.name,
      };

      logger.info({ accountId: account.id, name: account.name }, 'Chatwoot account created');
      return account;
    } catch (err) {
      logger.error({ err }, 'Failed to create Chatwoot account');
      throw err;
    }
  },

  async createAccountUser(
    platformToken: string,
    accountId: number,
    name: string,
    email: string
  ): Promise<ChatwootCreateAccountUserResult> {
    try {
      // Create user via Platform API
      const userResponse = await axios.post(
        `${CHATWOOT_BASE_URL}/platform/api/v1/users`,
        { name, email, password: generateRandomPassword() },
        {
          headers: {
            'api_access_token': platformToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const userId = userResponse.data.id;

      // Add user to account as administrator
      await axios.post(
        `${CHATWOOT_BASE_URL}/platform/api/v1/accounts/${accountId}/account_users`,
        { user_id: userId, role: 'administrator' },
        {
          headers: {
            'api_access_token': platformToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const result: ChatwootCreateAccountUserResult = {
        id: userId,
        name: userResponse.data.name,
        email: userResponse.data.email,
        access_token: userResponse.data.access_token,
      };

      logger.info({ userId: result.id, accountId }, 'Chatwoot account user created');
      return result;
    } catch (err) {
      logger.error({ err }, 'Failed to create Chatwoot account user');
      throw err;
    }
  },

  async setupWebhook(options: ChatwootSetupWebhookOptions): Promise<void> {
    try {
      await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${options.chatwootAccountId}/webhooks`,
        {
          url: options.webhookUrl,
          subscriptions: ['message_created', 'conversation_status_changed'],
        },
        {
          headers: {
            'api_access_token': options.chatwootApiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({ accountId: options.chatwootAccountId }, 'Chatwoot webhook configured');
    } catch (err) {
      logger.error({ err }, 'Failed to setup Chatwoot webhook');
      throw err;
    }
  },

  async provisionFullAccount(options: {
    platformToken: string;
    tenantSlug: string;
    firmName: string;
    webhookBaseUrl: string;
  }): Promise<ChatwootProvisionResult> {
    // 1. Create account
    const account = await this.createAccount(options.platformToken, options.firmName);

    // 2. Create admin user for this account
    const email = `admin-${options.tenantSlug}@chatbot.local`;
    const user = await this.createAccountUser(
      options.platformToken,
      account.id,
      `${options.firmName} Admin`,
      email
    );

    // 3. Create inbox using the new user's token
    const inbox = await this.createInbox({
      chatwootApiToken: user.access_token,
      chatwootAccountId: account.id,
      name: `${options.firmName} Inbox`,
    });

    // 4. Setup webhook
    const webhookUrl = `${options.webhookBaseUrl}/api/chatwoot/webhook`;
    await this.setupWebhook({
      chatwootApiToken: user.access_token,
      chatwootAccountId: account.id,
      webhookUrl,
    });

    return {
      chatwoot_account_id: account.id,
      chatwoot_inbox_id: inbox.id,
      chatwoot_api_token: user.access_token,
    };
  },
};

function generateRandomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 24; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}
