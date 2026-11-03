import axios from 'axios';
import { logger } from '../../config/logger';
import {
  ChatwootSendMessageOptions,
  ChatwootCreateConversationOptions,
} from './chatwoot.types';

const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'http://localhost:3000';

export const chatwootService = {
  async createConversation(options: ChatwootCreateConversationOptions): Promise<number | null> {
    try {
      // First, find or create a contact
      const contactId = await findOrCreateContact(options);
      if (!contactId) return null;

      // Create conversation
      const response = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${options.chatwootAccountId}/conversations`,
        {
          inbox_id: options.inboxId,
          contact_id: contactId,
          status: 'open',
        },
        {
          headers: {
            'api_access_token': options.chatwootApiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const conversationId = response.data.id;
      logger.info({ conversationId, contactId }, 'Chatwoot conversation created');
      return conversationId;
    } catch (err) {
      logger.error({ err }, 'Failed to create Chatwoot conversation');
      return null;
    }
  },

  async sendMessage(options: ChatwootSendMessageOptions): Promise<void> {
    try {
      await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${options.chatwootAccountId}/conversations/${options.conversationId}/messages`,
        {
          content: options.content,
          message_type: options.messageType,
        },
        {
          headers: {
            'api_access_token': options.chatwootApiToken,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (err) {
      logger.error({ err, conversationId: options.conversationId }, 'Failed to send Chatwoot message');
    }
  },
};

async function findOrCreateContact(
  options: ChatwootCreateConversationOptions
): Promise<number | null> {
  try {
    // Search for existing contact by identifier
    const searchResponse = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${options.chatwootAccountId}/contacts/search`,
      {
        params: { q: options.identifier },
        headers: { 'api_access_token': options.chatwootApiToken },
      }
    );

    const existing = searchResponse.data.payload?.find(
      (c: any) => c.identifier === options.identifier
    );
    if (existing) return existing.id;

    // Create new contact
    const createResponse = await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${options.chatwootAccountId}/contacts`,
      {
        name: options.contactName,
        identifier: options.identifier,
      },
      {
        headers: {
          'api_access_token': options.chatwootApiToken,
          'Content-Type': 'application/json',
        },
      }
    );

    return createResponse.data.payload?.contact?.id || null;
  } catch (err) {
    logger.error({ err }, 'Failed to find or create Chatwoot contact');
    return null;
  }
}
