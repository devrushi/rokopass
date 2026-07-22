import { Prisma } from "@prisma/client";
import { sendEmail } from "../lib/email";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

const MAX_SERIALIZATION_RETRIES = 3;

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
 * Books a child into a session, deducting credits, inside a single SERIALIZABLE transaction.
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
      void sendBookingConfirmationEmail(result);
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
      if (existing && existing.status === "CONFIRMED") {
        throw new AppError("This child is already booked into this class", 409);
      }

      const confirmedCount = await tx.booking.count({
        where: { sessionId, status: "CONFIRMED" },
      });
      if (confirmedCount >= session.capacity) {
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
            data: { status: "CONFIRMED", creditsSpent: cost },
          })
        : await tx.booking.create({
            data: { childId, sessionId, parentId, creditsSpent: cost },
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
    if (booking.status !== "CONFIRMED") {
      throw new AppError("Only confirmed bookings can be cancelled", 400);
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

async function sendBookingConfirmationEmail(result: Awaited<ReturnType<typeof runBookingTransaction>>) {
  try {
    const [parent, activity] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: result.booking.parentId } }),
      prisma.activity.findUniqueOrThrow({ where: { id: result.session.activityId } }),
    ]);

    await sendEmail({
      to: parent.email,
      subject: `Booking confirmed: ${activity.title}`,
      text: `${result.child.firstName} is booked into ${activity.title} on ${result.session.startsAt.toLocaleString()}. ${result.booking.creditsSpent} credits were used.`,
    });
  } catch (err) {
    // A failed notification shouldn't undo a successful, already-committed booking.
    console.error("Failed to send booking confirmation email", err);
  }
}
