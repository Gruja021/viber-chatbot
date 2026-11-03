import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err, method: req.method, url: req.url }, 'Unhandled error');

  res.status(500).json({
    error: 'Internal server error',
  });
}
