import type { Request, Response, NextFunction } from 'express';
import { NotFoundException, ConflictException, ConductorError } from '@conductor/common';

interface ErrorResponse {
  message: string;
  status: number;
  instance: string;
  retryable: boolean;
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const status = errorToStatus(err);
  const body: ErrorResponse = {
    message: err.message,
    status,
    instance: 'ts-conductor',
    retryable: err instanceof ConductorError,
  };
  res.status(status).json(body);
}

function errorToStatus(err: Error): number {
  if (err instanceof NotFoundException) return 404;
  if (err instanceof ConflictException) return 409;
  if (err instanceof ConductorError) return 500;
  if (err instanceof TypeError || err instanceof SyntaxError) return 400;
  return 500;
}
