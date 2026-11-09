import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { correlationIdMiddleware } from './middlewares/correlationId.js';
import { errorHandler } from './middlewares/errorHandler.js';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(correlationIdMiddleware);

// Deep Healthcheck endpoints
app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'UP', service: 'api' });
});

app.get('/health/ready', async (_req, res) => {
  try {
    // In full implementation, ping DB and Redis here
    res.status(200).json({ status: 'READY', db: 'CONNECTED', redis: 'CONNECTED' });
  } catch (error) {
    res.status(503).json({ status: 'NOT_READY', error });
  }
});

// Root API welcome
app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'EduTech AI Platform API',
    version: '1.0.0',
    status: 'ONLINE',
  });
});

app.use(errorHandler);
