import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Booking } from "../../lib/types";
import "../provider/provider.css";

export function MyBookings() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  function load() {
    apiRequest<{ bookings: Booking[] }>("/bookings/mine")
      .then((data) => setBookings(data.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load bookings"));
  }

  useEffect(load, []);

  async function cancel(bookingId: string) {
    setCancellingId(bookingId);
    setError(null);
    try {
      await apiRequest(`/bookings/${bookingId}`, { method: "DELETE" });
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
      {!bookings && !error && <p className="page-status">Loading…</p>}
      {bookings && bookings.length === 0 && <p className="page-status">No bookings yet.</p>}

      {bookings && bookings.length > 0 && (
        <ul className="activity-list">
          {bookings.map((booking) => {
            const isPast = new Date(booking.session.startsAt) <= new Date();
            return (
              <li key={booking.id} className="activity-card">
                <div>
                  <strong>{booking.session.activity.title}</strong>
                  <div className="activity-card__meta">
                    {booking.child.firstName} {booking.child.lastName} ·{" "}
                    {new Date(booking.session.startsAt).toLocaleString()} · {booking.status}
                  </div>
                </div>
                {booking.status === "CONFIRMED" && !isPast && (
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={cancellingId === booking.id}
                    onClick={() => cancel(booking.id)}
                  >
                    {cancellingId === booking.id ? "Cancelling…" : "Cancel"}
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
