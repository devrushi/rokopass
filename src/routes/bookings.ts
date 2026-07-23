import { Router } from "express";
import { param } from "../lib/requestParams";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { createBookingSchema, updateBookingStatusSchema } from "../schemas/bookings";
import { approveBooking, cancelBooking, createBooking, rejectBooking } from "../services/booking";
import { getCreditBalance } from "../services/creditBalance";

export const bookingsRouter = Router();

bookingsRouter.get("/mine", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { parentId: req.user!.sub },
      include: {
        child: { select: { id: true, firstName: true, lastName: true } },
        session: { include: { activity: { select: { id: true, title: true, location: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

bookingsRouter.get(
  "/pending-approval",
  requireAuth,
  requireRole("PROVIDER", "ADMIN"),
  async (req, res, next) => {
    try {
      const bookings = await prisma.booking.findMany({
        where: {
          status: "PENDING_APPROVAL",
          ...(req.user!.role === "ADMIN" ? {} : { session: { activity: { providerId: req.user!.sub } } }),
        },
        include: {
          child: { select: { id: true, firstName: true, lastName: true, allergyInfo: true } },
          parent: { select: { id: true, firstName: true, lastName: true, email: true } },
          session: { include: { activity: { select: { id: true, title: true } } } },
        },
        orderBy: { createdAt: "asc" },
      });
      res.json({ bookings });
    } catch (err) {
      next(err);
    }
  },
);

bookingsRouter.post("/", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid booking request", 400);
    }

    const created = await createBooking({
      parentId: req.user!.sub,
      childId: parsed.data.childId,
      sessionId: parsed.data.sessionId,
    });

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        child: { select: { id: true, firstName: true, lastName: true } },
        session: { include: { activity: { select: { id: true, title: true, location: true } } } },
      },
    });

    const balance = await getCreditBalance(req.user!.sub);
    res.status(201).json({ booking, balance });
  } catch (err) {
    next(err);
  }
});

bookingsRouter.delete("/:id", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const booking = await cancelBooking({ bookingId: param(req.params.id), parentId: req.user!.sub });
    const balance = await getCreditBalance(req.user!.sub);
    res.json({ booking, balance });
  } catch (err) {
    next(err);
  }
});

bookingsRouter.post(
  "/:id/approve",
  requireAuth,
  requireRole("PROVIDER", "ADMIN"),
  async (req, res, next) => {
    try {
      const booking = await approveBooking({
        bookingId: param(req.params.id),
        providerId: req.user!.sub,
        role: req.user!.role,
      });
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  },
);

bookingsRouter.post(
  "/:id/reject",
  requireAuth,
  requireRole("PROVIDER", "ADMIN"),
  async (req, res, next) => {
    try {
      const booking = await rejectBooking({
        bookingId: param(req.params.id),
        providerId: req.user!.sub,
        role: req.user!.role,
      });
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  },
);

bookingsRouter.patch(
  "/:id/status",
  requireAuth,
  requireRole("PROVIDER", "ADMIN"),
  async (req, res, next) => {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: param(req.params.id) },
        include: { session: { include: { activity: { select: { providerId: true } } } } },
      });
      if (!booking) {
        throw new AppError("Booking not found", 404);
      }
      if (req.user!.role !== "ADMIN" && booking.session.activity.providerId !== req.user!.sub) {
        throw new AppError("You do not have permission to modify this booking", 403);
      }
      if (booking.status !== "CONFIRMED") {
        throw new AppError("Only confirmed bookings can have their attendance recorded", 400);
      }

      const parsed = updateBookingStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message ?? "Invalid status", 400);
      }

      const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: { status: parsed.data.status },
      });

      res.json({ booking: updated });
    } catch (err) {
      next(err);
    }
  },
);
