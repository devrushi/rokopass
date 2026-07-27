import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Booking } from "../../lib/types";
import "../provider/provider.css";

// Mirrors src/services/booking.ts's FREE_CANCELLATION_CUTOFF_HOURS — used here only to label the
// Cancel button honestly before the parent commits to it; the backend is the actual source of
// truth for whether a cancellation gets refunded.
const FREE_CANCELLATION_CUTOFF_HOURS = 4;

function isWithinFreeCancellationWindow(booking: Booking): boolean {
  if (booking.status === "PENDING_APPROVAL") return true; // never earned by the provider yet
  const cutoff = new Date(booking.session.startsAt).getTime() - FREE_CANCELLATION_CUTOFF_HOURS * 60 * 60 * 1000;
  return Date.now() < cutoff;
}

export function MyBookings() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<string | null>(null);

  function load() {
    apiRequest<{ bookings: Booking[] }>("/bookings/mine")
      .then((data) => setBookings(data.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load bookings"));
  }

  useEffect(load, []);

  async function cancel(bookingId: string) {
    setCancellingId(bookingId);
    setError(null);
    setCancelResult(null);
    try {
      const data = await apiRequest<{ booking: Booking & { refunded: boolean; creditsForfeited: number } }>(
        `/bookings/${bookingId}`,
        { method: "DELETE" },
      );
      setCancelResult(
        data.booking.refunded
          ? "Booking cancelled — credits refunded."
          : `Booking cancelled — ${data.booking.creditsForfeited} credit${data.booking.creditsForfeited === 1 ? "" : "s"} forfeited (inside the ${FREE_CANCELLATION_CUTOFF_HOURS}-hour cancellation window).`,
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel booking");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="provider-page">
      <h1>My bookings</h1>

      {error && <p className="form__error">{error}</p>}
      {cancelResult && <p className="page-status">{cancelResult}</p>}
      {!bookings && !error && <p className="page-status">Loading…</p>}
      {bookings && bookings.length === 0 && <p className="page-status">No bookings yet.</p>}

      {bookings && bookings.length > 0 && (
        <ul className="activity-list">
          {bookings.map((booking) => {
            const isPast = new Date(booking.session.startsAt) <= new Date();
            const isCancellable =
              (booking.status === "CONFIRMED" || booking.status === "PENDING_APPROVAL") && !isPast;
            const willRefund = isCancellable && isWithinFreeCancellationWindow(booking);
            return (
              <li key={booking.id} className="activity-card">
                <div>
                  <strong>{booking.session.activity.title}</strong>
                  <div className="activity-card__meta">
                    {booking.child.firstName} {booking.child.lastName} ·{" "}
                    {new Date(booking.session.startsAt).toLocaleString()} · {booking.status}
                  </div>
                  {isCancellable && !willRefund && (
                    <div className="safety-note">
                      Cancelling now forfeits your {booking.creditsSpent} credit
                      {booking.creditsSpent === 1 ? "" : "s"} — inside the {FREE_CANCELLATION_CUTOFF_HOURS}-hour
                      cancellation window.
                    </div>
                  )}
                </div>
                {isCancellable && (
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={cancellingId === booking.id}
                    onClick={() => cancel(booking.id)}
                  >
                    {cancellingId === booking.id ? "Cancelling…" : willRefund ? "Cancel" : "Cancel (no refund)"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
