import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { AppError } from "./errorHandler";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return next(new AppError("Missing or invalid Authorization header", 401));
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError("Invalid or expired access token", 401));
  }
}
