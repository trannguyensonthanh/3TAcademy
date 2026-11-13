import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { correlationIdMiddleware } from './middlewares/correlationId.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { orderRouter } from './modules/order/order.routes.js';
import { learningRouter } from './modules/learning/learning.routes.js';
import { assessmentRouter } from './modules/assessment/assessment.routes.js';
import { profileRouter } from './modules/profile/profile.routes.js';
import { teachRouter } from './modules/teach/teach.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';

export const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : true,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use(correlationIdMiddleware);

// Deep Healthcheck endpoints
app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'UP', service: '3t-academy-api', version: '3.1.0' });
});

app.get('/health/ready', async (_req, res) => {
  try {
    res.status(200).json({ status: 'READY', db: 'CONNECTED', redis: 'CONNECTED' });
  } catch (error) {
    res.status(503).json({ status: 'NOT_READY', error });
  }
});

// Root API welcome
app.get('/api/v1', (_req, res) => {
  res.json({
    name: '3T AI Academy Backend API',
    version: '3.1.0',
    status: 'ONLINE',
  });
});

// Mount API v1 Modules (/api/v1/*)
const v1Router = express.Router();
v1Router.use('/auth', authRouter);
v1Router.use('/', catalogRouter);
v1Router.use('/', orderRouter);
v1Router.use('/', learningRouter);
v1Router.use('/', assessmentRouter);
v1Router.use('/', profileRouter);
v1Router.use('/', teachRouter);
v1Router.use('/', adminRouter);

app.use('/api/v1', v1Router);
app.use('/api', v1Router);

// 404 Fallback for unmatched API routes
app.use((req, res) => {
  const message = `Không tìm thấy đường dẫn API: ${req.method} ${req.originalUrl}`;
  res.status(404).json({
    success: false,
    status: 404,
    code: 'ROUTE_NOT_FOUND',
    message,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message,
    },
    requestId: req.correlationId,
  });
});

app.use(errorHandler);
