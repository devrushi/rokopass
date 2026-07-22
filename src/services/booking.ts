import { Prisma } from "@prisma/client";
import { sendEmail } from "../lib/email";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

const MAX_SERIALIZATION_RETRIES = 3;
const HOLDING_STATUSES = ["PENDING_APPROVAL", "CONFIRMED"] as const;

function isSerializationError(err: unknown): boolean {
  // P2034: "Transaction failed due to a write conflict or a deadlock" — Postgres SERIALIZABLE
  // rolling back one side of a genuine race (e.g. two parents booking the last spot at once).
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
}

interface CreateBookingParams {
  parentId: string;
  childId: string;
  sessionId: string;
}

/**
 * Requests a booking for a child, deducting credits up front, inside a single SERIALIZABLE
 * transaction. Bookings start life as PENDING_APPROVAL — the provider must approve or reject
 * before it counts as a confirmed spot (approveBooking/rejectBooking below). Credits are
 * deducted at request time rather than at approval time specifically so the capacity/balance
 * check and the deduction stay inside the same transaction; rejecting refunds via
 * BOOKING_REFUND, the same mechanism cancelBooking already used.
 *
 * Capacity and credit-balance checks read committed state that could otherwise change between
 * the check and the write under concurrent requests (two parents racing for the last spot; a
 * booking racing a renewal grant) — SERIALIZABLE makes Postgres detect that and abort one side,
 * which we retry a bounded number of times before giving up with a 409.
 */
export async function createBooking(params: CreateBookingParams) {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      const result = await runBookingTransaction(params);
      void sendBookingRequestedEmail(result);
      return result.booking;
    } catch (err) {
      lastError = err;
      if (!isSerializationError(err)) {
        throw err;
      }
    }
  }

  console.error("Booking failed after retries due to repeated write conflicts", lastError);
  throw new AppError("This class filled up while processing your booking — please try again", 409);
}

async function runBookingTransaction({ parentId, childId, sessionId }: CreateBookingParams) {
  return prisma.$transaction(
    async (tx) => {
      const child = await tx.child.findUnique({ where: { id: childId } });
      if (!child || child.parentId !== parentId) {
        throw new AppError("Child not found", 404);
      }

      const session = await tx.classSession.findUnique({
        where: { id: sessionId },
        include: { activity: true },
      });
      if (!session) {
        throw new AppError("Session not found", 404);
      }
      if (session.isCancelled) {
        throw new AppError("This class has been cancelled", 400);
      }
      if (session.startsAt <= new Date()) {
        throw new AppError("This class has already started", 400);
      }

      const existing = await tx.booking.findUnique({
        where: { childId_sessionId: { childId, sessionId } },
      });
      if (existing && (HOLDING_STATUSES as readonly string[]).includes(existing.status)) {
        throw new AppError("This child already has a booking request for this class", 409);
      }

      const holdingCount = await tx.booking.count({
        where: { sessionId, status: { in: [...HOLDING_STATUSES] } },
      });
      if (holdingCount >= session.capacity) {
        throw new AppError("This class is full", 409);
      }

      const balanceResult = await tx.creditTransaction.aggregate({
        where: { userId: parentId },
        _sum: { amount: true },
      });
      const balance = balanceResult._sum.amount ?? 0;
      const cost = session.activity.creditCost;
      if (balance < cost) {
        throw new AppError("Not enough credits for this booking", 402);
      }

      const booking = existing
        ? await tx.booking.update({
            where: { id: existing.id },
            data: { status: "PENDING_APPROVAL", creditsSpent: cost },
          })
        : await tx.booking.create({
            data: { childId, sessionId, parentId, status: "PENDING_APPROVAL", creditsSpent: cost },
          });

      await tx.creditTransaction.create({
        data: { userId: parentId, bookingId: booking.id, amount: -cost, reason: "BOOKING" },
      });

      return { booking, session, child };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

interface CancelBookingParams {
  bookingId: string;
  parentId: string;
}

export async function cancelBooking({ bookingId, parentId }: CancelBookingParams) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { session: true },
    });
    if (!booking || booking.parentId !== parentId) {
      throw new AppError("Booking not found", 404);
    }
    if (!(HOLDING_STATUSES as readonly string[]).includes(booking.status)) {
      throw new AppError("Only pending or confirmed bookings can be cancelled", 400);
    }
    if (booking.session.startsAt <= new Date()) {
      throw new AppError("This class has already started", 400);
    }

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
    });

    await tx.creditTransaction.create({
      data: {
        userId: parentId,
        bookingId: booking.id,
        amount: booking.creditsSpent,
        reason: "BOOKING_REFUND",
      },
    });

    return updated;
  });
}

interface ProviderBookingActionParams {
  bookingId: string;
  providerId: string;
  role: string;
}

async function loadPendingBookingForProvider(bookingId: string, providerId: string, role: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: { include: { activity: true } }, child: true },
  });
  if (!booking) {
    throw new AppError("Booking not found", 404);
  }
  if (role !== "ADMIN" && booking.session.activity.providerId !== providerId) {
    throw new AppError("You do not have permission to act on this booking", 403);
  }
  if (booking.status !== "PENDING_APPROVAL") {
    throw new AppError("Only pending bookings can be approved or rejected", 400);
  }
  return booking;
}

export async function approveBooking({ bookingId, providerId, role }: ProviderBookingActionParams) {
  const booking = await loadPendingBookingForProvider(bookingId, providerId, role);

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CONFIRMED" },
  });

  void sendBookingDecisionEmail(booking, "approved");
  return updated;
}

export async function rejectBooking({ bookingId, providerId, role }: ProviderBookingActionParams) {
  const booking = await loadPendingBookingForProvider(bookingId, providerId, role);

  const updated = await prisma.$transaction(async (tx) => {
    const rejected = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "REJECTED" },
    });
    await tx.creditTransaction.create({
      data: {
        userId: booking.parentId,
        bookingId: booking.id,
        amount: booking.creditsSpent,
        reason: "BOOKING_REFUND",
      },
    });
    return rejected;
  });

  void sendBookingDecisionEmail(booking, "rejected");
  return updated;
}

async function sendBookingRequestedEmail(result: Awaited<ReturnType<typeof runBookingTransaction>>) {
  try {
    const [parent, activity] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: result.booking.parentId } }),
      prisma.activity.findUniqueOrThrow({ where: { id: result.session.activityId } }),
    ]);

    await sendEmail({
      to: parent.email,
      subject: `Booking requested: ${activity.title}`,
      text: `${result.child.firstName}'s booking request for ${activity.title} on ${result.session.startsAt.toLocaleString()} has been sent to the provider for approval. ${result.booking.creditsSpent} credits were held.`,
    });
  } catch (err) {
    // A failed notification shouldn't undo a successful, already-committed booking.
    console.error("Failed to send booking requested email", err);
  }
}

async function sendBookingDecisionEmail(
  booking: Prisma.BookingGetPayload<{ include: { session: { include: { activity: true } }; child: true } }>,
  decision: "approved" | "rejected",
) {
  try {
    const parent = await prisma.user.findUniqueOrThrow({ where: { id: booking.parentId } });
    const activity = booking.session.activity;

    const text =
      decision === "approved"
        ? `${booking.child.firstName}'s booking for ${activity.title} on ${booking.session.startsAt.toLocaleString()} has been confirmed.`
        : `${booking.child.firstName}'s booking request for ${activity.title} on ${booking.session.startsAt.toLocaleString()} was declined. ${booking.creditsSpent} credits have been refunded.`;

    await sendEmail({
      to: parent.email,
      subject: `Booking ${decision}: ${activity.title}`,
      text,
    });
  } catch (err) {
    console.error(`Failed to send booking ${decision} email`, err);
  }
}
