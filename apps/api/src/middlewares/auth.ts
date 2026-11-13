import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthUser {
  id: number;
  email: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token) return token;
  }
  const cookieToken = req.cookies?.access_token;
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return undefined;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractAccessToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
      req.user = payload;
    } catch {
      // Ignore invalid or expired token on optional auth routes
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractAccessToken(req);
  if (!token) {
    const message = 'Vui lòng đăng nhập để tiếp tục';
    res.status(401).json({
      success: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message,
      error: {
        code: 'UNAUTHORIZED',
        message,
      },
      requestId: req.correlationId,
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch {
    const message = 'Phiên đăng nhập đã hết hạn, vui lòng làm mới token';
    res.status(401).json({
      success: false,
      status: 401,
      code: 'TOKEN_EXPIRED',
      message,
      error: {
        code: 'TOKEN_EXPIRED',
        message,
      },
      requestId: req.correlationId,
    });
  }
}

export function requireRole(allowedRoles: Array<'STUDENT' | 'INSTRUCTOR' | 'ADMIN'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const message = 'Yêu cầu xác thực tài khoản';
      res.status(401).json({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message,
        error: {
          code: 'UNAUTHORIZED',
          message,
        },
        requestId: req.correlationId,
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      const message = 'Bạn không có quyền truy cập vào tài nguyên này';
      res.status(403).json({
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        message,
        error: {
          code: 'FORBIDDEN',
          message,
        },
        requestId: req.correlationId,
      });
      return;
    }

    next();
  };
}
