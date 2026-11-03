import axios from 'axios';
import { logger } from '../../config/logger';

const VIBER_API_BASE = 'https://chatapi.viber.com/pa';

export interface ViberSendMessageOptions {
  authToken: string;
  receiverId: string;
  text: string;
  senderName?: string;
  senderAvatar?: string;
}

export const viberService = {
  async sendTextMessage(options: ViberSendMessageOptions): Promise<void> {
    try {
      const response = await axios.post(
        `${VIBER_API_BASE}/send_message`,
        {
          receiver: options.receiverId,
          min_api_version: 1,
          sender: {
            name: options.senderName || 'Bot',
            avatar: options.senderAvatar,
          },
          type: 'text',
          text: options.text,
        },
        {
          headers: {
            'X-Viber-Auth-Token': options.authToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.status !== 0) {
        logger.error(
          { status: response.data.status, statusMessage: response.data.status_message },
          'Viber API returned error'
        );
      }
    } catch (err) {
      logger.error({ err }, 'Failed to send Viber message');
      throw err;
    }
  },

  async setWebhook(authToken: string, webhookUrl: string, eventTypes?: string[]): Promise<void> {
    try {
      const response = await axios.post(
        `${VIBER_API_BASE}/set_webhook`,
        {
          url: webhookUrl,
          event_types: eventTypes || [
            'delivered',
            'seen',
            'failed',
            'subscribed',
            'unsubscribed',
            'conversation_started',
          ],
          send_name: true,
          send_photo: true,
        },
        {
          headers: {
            'X-Viber-Auth-Token': authToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.status !== 0) {
        throw new Error(`Viber set_webhook failed: ${response.data.status_message}`);
      }

      logger.info({ webhookUrl }, 'Viber webhook registered');
    } catch (err) {
      logger.error({ err }, 'Failed to register Viber webhook');
      throw err;
    }
  },
};
