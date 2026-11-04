export type Platform = 'viber' | 'telegram';

export interface PlatformSender {
  platform: Platform;
  userId: string;
  userName: string;
}

export interface PlatformMessenger {
  sendTextMessage(tenant: any, receiverId: string, text: string): Promise<void>;
}
