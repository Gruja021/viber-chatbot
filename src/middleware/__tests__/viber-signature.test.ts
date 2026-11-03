import crypto from 'crypto';
import { viberSignature } from '../viber-signature';

describe('viberSignature middleware', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      headers: {},
      tenant: {
        viber_auth_token: 'test-token-123',
        slug: 'test-tenant',
      },
      rawBody: Buffer.from('{"event":"message"}'),
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('returns 403 when signature header is missing', () => {
    viberSignature(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing signature' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when tenant is not resolved', () => {
    req.headers['x-viber-content-signature'] = 'some-sig';
    req.tenant = undefined;
    viberSignature(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal error' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when rawBody is missing', () => {
    req.headers['x-viber-content-signature'] = 'some-sig';
    req.rawBody = undefined;
    viberSignature(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal error' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when signature is invalid', () => {
    req.headers['x-viber-content-signature'] = 'invalid-signature-hex';
    viberSignature(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when signature is valid', () => {
    const expectedSig = crypto
      .createHmac('sha256', req.tenant.viber_auth_token)
      .update(req.rawBody)
      .digest('hex');
    req.headers['x-viber-content-signature'] = expectedSig;

    viberSignature(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
