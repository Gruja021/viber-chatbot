import axios from 'axios';
import { chatwootProvisioningService } from '../chatwoot.provisioning';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('chatwootProvisioningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInbox', () => {
    const options = {
      chatwootApiToken: 'cw-token',
      chatwootAccountId: 1,
      name: 'Test Inbox',
    };

    it('creates inbox successfully', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 42, name: 'Test Inbox', channel_type: 'api' },
      });

      const result = await chatwootProvisioningService.createInbox(options);

      expect(result).toEqual({ id: 42, name: 'Test Inbox', channel_type: 'api' });
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/1/inboxes'),
        expect.objectContaining({ name: 'Test Inbox' }),
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'cw-token' }),
        })
      );
    });

    it('uses custom channel type when provided', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 43, name: 'Custom Inbox', channel_type: 'web_widget' },
      });

      await chatwootProvisioningService.createInbox({
        ...options,
        channelType: 'web_widget',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          channel: { type: 'web_widget' },
        }),
        expect.any(Object)
      );
    });

    it('throws on API error', async () => {
      mockAxios.post.mockRejectedValue(new Error('API error'));

      await expect(chatwootProvisioningService.createInbox(options)).rejects.toThrow('API error');
    });

    it('defaults to "api" channel type when not provided', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 44, name: 'Default Channel', channel_type: 'api' },
      });

      await chatwootProvisioningService.createInbox(options);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          channel: { type: 'api' },
        }),
        expect.any(Object)
      );
    });

    it('builds correct URL with different account IDs', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 50, name: 'Inbox', channel_type: 'api' },
      });

      await chatwootProvisioningService.createInbox({
        ...options,
        chatwootAccountId: 99,
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/99/inboxes'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('extracts only id, name, channel_type from response', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          id: 42,
          name: 'Test Inbox',
          channel_type: 'api',
          extra_field: 'should be ignored',
          another: 123,
        },
      });

      const result = await chatwootProvisioningService.createInbox(options);

      expect(result).toEqual({ id: 42, name: 'Test Inbox', channel_type: 'api' });
      expect(result).not.toHaveProperty('extra_field');
    });
  });

  describe('addAgentsToInbox', () => {
    const options = {
      chatwootApiToken: 'cw-token',
      chatwootAccountId: 1,
      inboxId: 42,
      agentIds: [1, 2, 3],
    };

    it('assigns agents successfully', async () => {
      mockAxios.post.mockResolvedValue({ data: { payload: [] } });

      await chatwootProvisioningService.addAgentsToInbox(options);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/1/inbox_members'),
        expect.objectContaining({
          inbox_id: 42,
          user_ids: [1, 2, 3],
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'cw-token' }),
        })
      );
    });

    it('throws on API error', async () => {
      mockAxios.post.mockRejectedValue(new Error('Forbidden'));

      await expect(chatwootProvisioningService.addAgentsToInbox(options)).rejects.toThrow('Forbidden');
    });

    it('sends correct inbox_id and agent IDs in body', async () => {
      mockAxios.post.mockResolvedValue({ data: { payload: [] } });

      await chatwootProvisioningService.addAgentsToInbox({
        chatwootApiToken: 'token-2',
        chatwootAccountId: 5,
        inboxId: 77,
        agentIds: [10, 20],
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/5/inbox_members'),
        { inbox_id: 77, user_ids: [10, 20] },
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'token-2' }),
        })
      );
    });
  });

  describe('listAgents', () => {
    it('returns list of agents', async () => {
      const agents = [
        { id: 1, name: 'Agent 1', email: 'a1@test.com', role: 'agent' },
        { id: 2, name: 'Agent 2', email: 'a2@test.com', role: 'administrator' },
      ];
      mockAxios.get.mockResolvedValue({ data: agents });

      const result = await chatwootProvisioningService.listAgents('cw-token', 1);

      expect(result).toEqual(agents);
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/1/agents'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'cw-token' }),
        })
      );
    });

    it('throws on API error', async () => {
      mockAxios.get.mockRejectedValue(new Error('Unauthorized'));

      await expect(chatwootProvisioningService.listAgents('bad-token', 1)).rejects.toThrow('Unauthorized');
    });

    it('returns empty array when no agents exist', async () => {
      mockAxios.get.mockResolvedValue({ data: [] });

      const result = await chatwootProvisioningService.listAgents('cw-token', 1);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('builds correct URL with different account IDs', async () => {
      mockAxios.get.mockResolvedValue({ data: [] });

      await chatwootProvisioningService.listAgents('cw-token', 42);

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/42/agents'),
        expect.any(Object)
      );
    });
  });
});
