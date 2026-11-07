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

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Vui lòng đăng nhập để tiếp tục',
      requestId: req.correlationId,
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token!, env.JWT_ACCESS_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({
      status: 401,
      code: 'TOKEN_EXPIRED',
      message: 'Phiên đăng nhập đã hết hạn, vui lòng làm mới token',
      requestId: req.correlationId,
    });
  }
}

export function requireRole(allowedRoles: Array<'STUDENT' | 'INSTRUCTOR' | 'ADMIN'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Yêu cầu xác thực tài khoản',
        requestId: req.correlationId,
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền truy cập vào tài nguyên này',
        requestId: req.correlationId,
      });
      return;
    }

    next();
  };
}
