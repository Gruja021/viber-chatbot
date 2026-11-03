import axios from 'axios';
import { chatwootService } from '../chatwoot.service';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('chatwootService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversation', () => {
    const baseOptions = {
      chatwootApiToken: 'cw-token',
      chatwootAccountId: 1,
      inboxId: 5,
      contactName: 'Test User',
      identifier: 'viber-user-123',
    };

    it('uses existing contact when found', async () => {
      // Search returns existing contact
      mockAxios.get.mockResolvedValue({
        data: { payload: [{ id: 42, identifier: 'viber-user-123' }] },
      });
      // Create conversation
      mockAxios.post.mockResolvedValue({ data: { id: 99 } });

      const result = await chatwootService.createConversation(baseOptions);
      expect(result).toBe(99);
      // Should not create new contact
      expect(mockAxios.post).toHaveBeenCalledTimes(1);
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/conversations'),
        expect.objectContaining({ contact_id: 42, inbox_id: 5 }),
        expect.any(Object)
      );
    });

    it('creates new contact when not found', async () => {
      // Search returns no match
      mockAxios.get.mockResolvedValue({ data: { payload: [] } });
      // Create contact
      mockAxios.post
        .mockResolvedValueOnce({
          data: { payload: { contact: { id: 55 } } },
        })
        // Create conversation
        .mockResolvedValueOnce({ data: { id: 100 } });

      const result = await chatwootService.createConversation(baseOptions);
      expect(result).toBe(100);
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
    });

    it('returns null on API error', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      const result = await chatwootService.createConversation(baseOptions);
      expect(result).toBeNull();
    });
  });

  describe('sendMessage', () => {
    const options = {
      chatwootApiToken: 'cw-token',
      chatwootAccountId: 1,
      conversationId: 99,
      content: 'Hello from Viber',
      messageType: 'incoming' as const,
    };

    it('sends message successfully', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 1 } });

      await chatwootService.sendMessage(options);
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/99/messages'),
        { content: 'Hello from Viber', message_type: 'incoming' },
        expect.any(Object)
      );
    });

    it('does not throw on error (swallows)', async () => {
      mockAxios.post.mockRejectedValue(new Error('API down'));
      await expect(chatwootService.sendMessage(options)).resolves.not.toThrow();
    });
  });

  describe('addInternalNote', () => {
    const options = {
      chatwootApiToken: 'cw-token',
      chatwootAccountId: 1,
      conversationId: 99,
      content: 'Internal note content',
    };

    it('sends private message to conversation', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 1 } });

      await chatwootService.addInternalNote(options);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/99/messages'),
        {
          content: 'Internal note content',
          message_type: 'outgoing',
          private: true,
        },
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'cw-token' }),
        })
      );
    });

    it('does not throw on error (swallows)', async () => {
      mockAxios.post.mockRejectedValue(new Error('API down'));
      await expect(chatwootService.addInternalNote(options)).resolves.not.toThrow();
    });
  });

  describe('assignConversation', () => {
    const options = {
      chatwootApiToken: 'cw-token',
      chatwootAccountId: 1,
      conversationId: 99,
      assigneeId: 5,
    };

    it('assigns conversation to agent', async () => {
      mockAxios.post.mockResolvedValue({ data: {} });

      await chatwootService.assignConversation(options);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/99/assignments'),
        { assignee_id: 5 },
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'cw-token' }),
        })
      );
    });

    it('sends null assignee_id when not provided', async () => {
      mockAxios.post.mockResolvedValue({ data: {} });

      await chatwootService.assignConversation({
        chatwootApiToken: 'cw-token',
        chatwootAccountId: 1,
        conversationId: 99,
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        { assignee_id: null },
        expect.any(Object)
      );
    });

    it('does not throw on error (swallows)', async () => {
      mockAxios.post.mockRejectedValue(new Error('API down'));
      await expect(chatwootService.assignConversation(options)).resolves.not.toThrow();
    });
  });
});
