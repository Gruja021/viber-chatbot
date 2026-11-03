import { errorHandler } from '../error-handler';

describe('errorHandler middleware', () => {
  it('returns 500 with generic error message', () => {
    const err = new Error('Something broke');
    const req: any = { method: 'GET', url: '/test' };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
