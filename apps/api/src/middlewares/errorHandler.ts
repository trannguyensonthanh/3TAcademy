import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const requestId = req.correlationId || 'unknown';

  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        code: err.code,
        details: err.details,
      },
      requestId,
      url: req.originalUrl,
      method: req.method,
    },
    'Request error'
  );

  res.status(statusCode).json({
    type: `https://api.edutech.vn/errors/${err.code || 'INTERNAL_ERROR'}`,
    title: statusCode === 500 && env.NODE_ENV === 'production' ? 'Đã xảy ra lỗi máy chủ nội bộ' : err.message,
    status: statusCode,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    requestId,
    details: env.NODE_ENV !== 'production' ? err.details : undefined,
  });
}
