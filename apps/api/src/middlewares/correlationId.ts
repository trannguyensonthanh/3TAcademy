import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'] as string | undefined;
  const correlationId = existingId && existingId.length > 0 ? existingId : uuidv4();
  req.correlationId = correlationId;
  res.setHeader('X-Request-ID', correlationId);
  next();
}
