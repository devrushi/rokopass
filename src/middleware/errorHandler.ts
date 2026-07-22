import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

// Must keep all four params for Express to recognize this as an error handler.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError || err instanceof Error ? (err as Error).message : "Internal server error";

  if (!isAppError || statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      message,
      ...(env.NODE_ENV === "development" && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}
