import crypto from 'crypto';
import { chatwootWebhookAuth } from '../chatwoot-webhook-auth';
import { env } from '../../config/env';

describe('chatwootWebhookAuth middleware', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      headers: {},
      body: { event: 'message_created', data: { content: 'hello' } },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('when CHATWOOT_WEBHOOK_SECRET is not set', () => {
    beforeEach(() => {
      (env as any).CHATWOOT_WEBHOOK_SECRET = '';
    });

    it('allows request in non-production mode', () => {
      (env as any).NODE_ENV = 'test';
      chatwootWebhookAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects request in production mode', () => {
      (env as any).NODE_ENV = 'production';
      chatwootWebhookAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Webhook authentication not configured' });
      expect(next).not.toHaveBeenCalled();
      (env as any).NODE_ENV = 'test';
    });
  });

  describe('when CHATWOOT_WEBHOOK_SECRET is set', () => {
    const SECRET = 'my-chatwoot-secret-token';

    beforeEach(() => {
      (env as any).CHATWOOT_WEBHOOK_SECRET = SECRET;
    });

    afterEach(() => {
      (env as any).CHATWOOT_WEBHOOK_SECRET = '';
    });

    it('rejects request with no authentication headers', () => {
      chatwootWebhookAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing webhook authentication' });
      expect(next).not.toHaveBeenCalled();
    });

    describe('HMAC signature method (x-chatwoot-signature)', () => {
      it('allows request with valid HMAC signature', () => {
        const rawBody = JSON.stringify(req.body);
        const validSig = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
        req.headers['x-chatwoot-signature'] = validSig;

        chatwootWebhookAuth(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it('rejects request with invalid HMAC signature', () => {
        req.headers['x-chatwoot-signature'] = 'invalid-signature-hex-string-that-is-definitely-wrong';

        chatwootWebhookAuth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid webhook signature' });
        expect(next).not.toHaveBeenCalled();
      });

      it('rejects request when signature length differs from expected', () => {
        req.headers['x-chatwoot-signature'] = 'short';

        chatwootWebhookAuth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      });

      it('signature depends on body content', () => {
        // Compute signature for a DIFFERENT body
        const differentBody = JSON.stringify({ event: 'different' });
        const wrongSig = crypto.createHmac('sha256', SECRET).update(differentBody).digest('hex');
        req.headers['x-chatwoot-signature'] = wrongSig;

        chatwootWebhookAuth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('token header method (x-chatwoot-webhook-token)', () => {
      it('allows request with valid token header', () => {
        req.headers['x-chatwoot-webhook-token'] = SECRET;

        chatwootWebhookAuth(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it('rejects request with invalid token header', () => {
        req.headers['x-chatwoot-webhook-token'] = 'wrong-token-value';

        chatwootWebhookAuth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid webhook token' });
        expect(next).not.toHaveBeenCalled();
      });

      it('rejects request when token length differs', () => {
        req.headers['x-chatwoot-webhook-token'] = 'x';

        chatwootWebhookAuth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      });
    });

    it('prefers HMAC signature over token header when both present', () => {
      const rawBody = JSON.stringify(req.body);
      const validSig = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
      req.headers['x-chatwoot-signature'] = validSig;
      req.headers['x-chatwoot-webhook-token'] = 'wrong-token';

      chatwootWebhookAuth(req, res, next);
      // Should succeed because HMAC is checked first and is valid
      expect(next).toHaveBeenCalled();
    });
  });
});
