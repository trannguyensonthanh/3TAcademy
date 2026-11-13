import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export function validate(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstError = error.errors[0];
        const message = firstError
          ? `Dữ liệu yêu cầu không hợp lệ (${firstError.path.join('.')}: ${firstError.message})`
          : 'Dữ liệu yêu cầu không hợp lệ';
        res.status(400).json({
          success: false,
          status: 400,
          code: 'VALIDATION_ERROR',
          message,
          error: {
            code: 'VALIDATION_ERROR',
            message,
          },
          requestId: req.correlationId,
          errors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}
