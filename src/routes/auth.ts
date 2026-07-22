import { Router } from "express";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { serializeUser } from "../lib/serializeUser";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { loginSchema, refreshSchema, registerSchema, updateProfileSchema } from "../schemas/auth";

export const authRouter = Router();

function issueTokens(user: { id: string; email: string; role: string }) {
  return {
    accessToken: signAccessToken({ sub: user.id, email: user.email, role: user.role }),
    refreshToken: signRefreshToken({ sub: user.id }),
  };
}

authRouter.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid registration data", 400);
    }
    const { email, password, firstName, lastName, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError("An account with this email already exists", 409);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        verificationStatus: role === "PROVIDER" ? "PENDING" : null,
      },
    });

    res.status(201).json({ user: serializeUser(user), ...issueTokens(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Email and password are required", 400);
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError("Invalid email or password", 401);
    }

    res.json({ user: serializeUser(user), ...issueTokens(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("refreshToken is required", 400);
    }

    let payload;
    try {
      payload = verifyRefreshToken(parsed.data.refreshToken);
    } catch {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    res.json({ accessToken: signAccessToken({ sub: user.id, email: user.email, role: user.role }) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) {
      throw new AppError("User not found", 404);
    }
    res.json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid profile data", 400);
    }

    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: parsed.data,
    });

    res.json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});
