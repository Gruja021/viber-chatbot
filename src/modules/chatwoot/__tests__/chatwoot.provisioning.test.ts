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

  describe('createAgent', () => {
    it('creates an agent successfully', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 10, name: 'John', email: 'john@test.com', role: 'agent' },
      });

      const result = await chatwootProvisioningService.createAgent('cw-token', 1, 'John', 'john@test.com');

      expect(result).toEqual({ id: 10, name: 'John', email: 'john@test.com', role: 'agent' });
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/1/agents'),
        expect.objectContaining({ name: 'John', email: 'john@test.com', role: 'agent' }),
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'cw-token' }),
        })
      );
    });

    it('throws on API error', async () => {
      mockAxios.post.mockRejectedValue(new Error('Email taken'));

      await expect(
        chatwootProvisioningService.createAgent('cw-token', 1, 'John', 'john@test.com')
      ).rejects.toThrow('Email taken');
    });

    it('builds correct URL with different account IDs', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 11, name: 'A', email: 'a@b.com', role: 'agent' },
      });

      await chatwootProvisioningService.createAgent('token', 42, 'A', 'a@b.com');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/42/agents'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('extracts only id, name, email, role from response', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 10, name: 'J', email: 'j@t.com', role: 'agent', extra: 'ignored' },
      });

      const result = await chatwootProvisioningService.createAgent('token', 1, 'J', 'j@t.com');

      expect(result).toEqual({ id: 10, name: 'J', email: 'j@t.com', role: 'agent' });
      expect(result).not.toHaveProperty('extra');
    });

    it('always sets role to agent', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 10, name: 'J', email: 'j@t.com', role: 'agent' },
      });

      await chatwootProvisioningService.createAgent('token', 1, 'J', 'j@t.com');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ role: 'agent' }),
        expect.any(Object)
      );
    });
  });

  describe('listInboxAgents', () => {
    it('returns list of inbox agents', async () => {
      const agents = [
        { id: 1, name: 'Agent 1', email: 'a1@test.com', role: 'agent' },
      ];
      mockAxios.get.mockResolvedValue({ data: { payload: agents } });

      const result = await chatwootProvisioningService.listInboxAgents('cw-token', 1, 42);

      expect(result).toEqual(agents);
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/1/inbox_members/42'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'cw-token' }),
        })
      );
    });

    it('handles response without payload wrapper', async () => {
      const agents = [{ id: 1, name: 'Agent 1', email: 'a1@test.com', role: 'agent' }];
      mockAxios.get.mockResolvedValue({ data: agents });

      const result = await chatwootProvisioningService.listInboxAgents('cw-token', 1, 42);

      expect(result).toEqual(agents);
    });

    it('throws on API error', async () => {
      mockAxios.get.mockRejectedValue(new Error('Forbidden'));

      await expect(
        chatwootProvisioningService.listInboxAgents('bad-token', 1, 42)
      ).rejects.toThrow('Forbidden');
    });

    it('builds correct URL with different account and inbox IDs', async () => {
      mockAxios.get.mockResolvedValue({ data: [] });

      await chatwootProvisioningService.listInboxAgents('token', 5, 77);

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/5/inbox_members/77'),
        expect.any(Object)
      );
    });

    it('returns empty array when no agents in inbox', async () => {
      mockAxios.get.mockResolvedValue({ data: { payload: [] } });

      const result = await chatwootProvisioningService.listInboxAgents('token', 1, 42);
      expect(result).toEqual([]);
    });
  });

  describe('removeAgentFromInbox', () => {
    it('removes agent from inbox successfully', async () => {
      mockAxios.delete.mockResolvedValue({ data: {} });

      await chatwootProvisioningService.removeAgentFromInbox('cw-token', 1, 42, [10]);

      expect(mockAxios.delete).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/1/inbox_members'),
        expect.objectContaining({
          data: { inbox_id: 42, user_ids: [10] },
          headers: expect.objectContaining({ 'api_access_token': 'cw-token' }),
        })
      );
    });

    it('throws on API error', async () => {
      mockAxios.delete.mockRejectedValue(new Error('Not found'));

      await expect(
        chatwootProvisioningService.removeAgentFromInbox('cw-token', 1, 42, [999])
      ).rejects.toThrow('Not found');
    });

    it('removes multiple agents in a single call', async () => {
      mockAxios.delete.mockResolvedValue({ data: {} });

      await chatwootProvisioningService.removeAgentFromInbox('cw-token', 1, 42, [10, 20, 30]);

      expect(mockAxios.delete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: { inbox_id: 42, user_ids: [10, 20, 30] },
        })
      );
    });
  });

  describe('createAccount', () => {
    it('creates account via Platform API', async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 5, name: 'Test Corp' },
      });

      const result = await chatwootProvisioningService.createAccount('platform-token', 'Test Corp');

      expect(result).toEqual({ id: 5, name: 'Test Corp' });
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/platform/api/v1/accounts'),
        { name: 'Test Corp' },
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'platform-token' }),
        })
      );
    });

    it('throws on API error', async () => {
      mockAxios.post.mockRejectedValue(new Error('Unauthorized'));

      await expect(chatwootProvisioningService.createAccount('bad-token', 'Test')).rejects.toThrow('Unauthorized');
    });
  });

  describe('createAccountUser', () => {
    it('creates user and adds to account', async () => {
      mockAxios.post
        .mockResolvedValueOnce({
          data: { id: 10, name: 'Admin', email: 'admin@test.com', access_token: 'user-token' },
        })
        .mockResolvedValueOnce({
          data: {},
        });

      const result = await chatwootProvisioningService.createAccountUser('platform-token', 5, 'Admin', 'admin@test.com');

      expect(result).toEqual({
        id: 10,
        name: 'Admin',
        email: 'admin@test.com',
        access_token: 'user-token',
      });

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      // First call: create user
      expect(mockAxios.post).toHaveBeenNthCalledWith(1,
        expect.stringContaining('/platform/api/v1/users'),
        expect.objectContaining({ name: 'Admin', email: 'admin@test.com' }),
        expect.any(Object)
      );
      // Second call: add user to account
      expect(mockAxios.post).toHaveBeenNthCalledWith(2,
        expect.stringContaining('/platform/api/v1/accounts/5/account_users'),
        expect.objectContaining({ user_id: 10, role: 'administrator' }),
        expect.any(Object)
      );
    });

    it('throws on API error', async () => {
      mockAxios.post.mockRejectedValue(new Error('User exists'));

      await expect(
        chatwootProvisioningService.createAccountUser('platform-token', 5, 'Admin', 'admin@test.com')
      ).rejects.toThrow('User exists');
    });
  });

  describe('setupWebhook', () => {
    it('creates webhook for account', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 1 } });

      await chatwootProvisioningService.setupWebhook({
        chatwootApiToken: 'user-token',
        chatwootAccountId: 5,
        webhookUrl: 'https://example.com/api/chatwoot/webhook',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/5/webhooks'),
        expect.objectContaining({
          url: 'https://example.com/api/chatwoot/webhook',
          subscriptions: ['message_created', 'conversation_status_changed'],
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ 'api_access_token': 'user-token' }),
        })
      );
    });

    it('throws on API error', async () => {
      mockAxios.post.mockRejectedValue(new Error('Invalid URL'));

      await expect(chatwootProvisioningService.setupWebhook({
        chatwootApiToken: 'token',
        chatwootAccountId: 5,
        webhookUrl: 'bad-url',
      })).rejects.toThrow('Invalid URL');
    });
  });

  describe('provisionFullAccount', () => {
    it('orchestrates full account creation', async () => {
      // createAccount
      mockAxios.post.mockResolvedValueOnce({ data: { id: 5, name: 'Test Corp' } });
      // createAccountUser - create user
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 10, name: 'Admin', email: 'admin@test.com', access_token: 'at-123' },
      });
      // createAccountUser - add to account
      mockAxios.post.mockResolvedValueOnce({ data: {} });
      // createInbox
      mockAxios.post.mockResolvedValueOnce({ data: { id: 20, name: 'Test Inbox', channel_type: 'api' } });
      // setupWebhook
      mockAxios.post.mockResolvedValueOnce({ data: { id: 1 } });

      const result = await chatwootProvisioningService.provisionFullAccount({
        platformToken: 'platform-token',
        tenantSlug: 'test-corp',
        firmName: 'Test Corp',
        webhookBaseUrl: 'https://example.com',
      });

      expect(result).toEqual({
        chatwoot_account_id: 5,
        chatwoot_inbox_id: 20,
        chatwoot_api_token: 'at-123',
      });

      expect(mockAxios.post).toHaveBeenCalledTimes(5);
    });

    it('throws if account creation fails', async () => {
      mockAxios.post.mockRejectedValue(new Error('Chatwoot down'));

      await expect(chatwootProvisioningService.provisionFullAccount({
        platformToken: 'platform-token',
        tenantSlug: 'test',
        firmName: 'Test',
        webhookBaseUrl: 'https://example.com',
      })).rejects.toThrow('Chatwoot down');
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
