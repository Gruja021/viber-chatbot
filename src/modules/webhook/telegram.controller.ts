import { Request, Response } from 'express';
import { logger } from '../../config/logger';
import { telegramService } from './telegram.service';
import { handleIncomingMessage, handleWelcomeMessage } from './message-handler';
import { PlatformMessenger, PlatformSender } from '../../types/platform';
import {
  TelegramUpdate,
  isTelegramTextMessage,
  getTelegramTextContent,
  getTelegramSenderName,
} from '../../utils/telegram-helpers';

const telegramMessenger: PlatformMessenger = {
  async sendTextMessage(tenant: any, receiverId: string, text: string): Promise<void> {
    await telegramService.sendTextMessage(tenant.telegram_bot_token, receiverId, text);
  },
};

export async function handleTelegramWebhook(req: Request, res: Response) {
  const tenant = req.tenant!;
  const update = req.body as TelegramUpdate;

  logger.info({ updateId: update.update_id, tenantSlug: tenant.slug }, 'Telegram update received');

  // Acknowledge immediately
  res.status(200).json({ ok: true });

  try {
    if (!isTelegramTextMessage(update)) {
      logger.debug({ tenantSlug: tenant.slug }, 'Non-text Telegram message, ignoring');
      return;
    }

    const message = update.message!;
    const text = getTelegramTextContent(update);
    if (!text) return;

    const sender: PlatformSender = {
      platform: 'telegram',
      userId: String(message.chat.id),
      userName: getTelegramSenderName(message),
    };

    // Telegram /start command is like conversation_started
    if (text === '/start') {
      await handleWelcomeMessage(tenant, sender, telegramMessenger);
      return;
    }

    await handleIncomingMessage(
      tenant,
      sender,
      text,
      String(message.message_id),
      telegramMessenger
    );
  } catch (err) {
    logger.error({ err, tenantSlug: tenant.slug, updateId: update.update_id }, 'Error processing Telegram webhook');
  }
}
