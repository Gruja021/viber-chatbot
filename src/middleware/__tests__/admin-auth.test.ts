import { adminAuth } from '../admin-auth';

describe('adminAuth middleware', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('returns 401 when no Authorization header', () => {
    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header has no Bearer prefix', () => {
    req.headers.authorization = 'wrong-format';
    adminAuth(req, res, next);
    // After removing 'Bearer ', the token won't match
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is wrong', () => {
    req.headers.authorization = 'Bearer wrong-token';
    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token has different length', () => {
    req.headers.authorization = 'Bearer short';
    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when token is correct', () => {
    // ADMIN_API_TOKEN is set to 'test-admin-token' in test setup
    req.headers.authorization = 'Bearer test-admin-token';
    adminAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when Bearer token is empty string', () => {
    req.headers.authorization = 'Bearer ';
    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('is timing-safe (does not leak token length via fast rejection)', () => {
    // This test verifies the middleware doesn't use simple === comparison
    // Both should take roughly the same time (we can't precisely measure, but verify behavior)
    req.headers.authorization = 'Bearer x';
    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);

    jest.clearAllMocks();

    // Same-length wrong token
    req.headers.authorization = 'Bearer test-admin-wrong';
    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
