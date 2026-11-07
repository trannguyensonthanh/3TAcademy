import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';

export const codeSandboxRouter = Router();

const runCodeSchema = z.object({
  code: z.string().min(1, 'Mã nguồn không được để trống'),
  language: z.enum(['python', 'javascript', 'typescript', 'java', 'cpp', 'sql']),
  stdin: z.string().optional().default(''),
});

codeSandboxRouter.post(
  '/run',
  validate(runCodeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, language, stdin } = req.body;
      const result = await aiServiceClient.runCodeSandbox(code, language, stdin, req.correlationId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);
