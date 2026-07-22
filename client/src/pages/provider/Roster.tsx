import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { AttendeeBooking, BookingStatus } from "../../lib/types";
import "./provider.css";

export function Roster() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [bookings, setBookings] = useState<AttendeeBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function load() {
    if (!sessionId) return;
    apiRequest<{ bookings: AttendeeBooking[] }>(`/sessions/${sessionId}/attendees`)
      .then((data) => setBookings(data.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load roster"));
  }

  useEffect(load, [sessionId]);

  async function setStatus(bookingId: string, status: Extract<BookingStatus, "ATTENDED" | "NO_SHOW">) {
    setUpdatingId(bookingId);
    setError(null);
    try {
      await apiRequest(`/bookings/${bookingId}/status`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update attendance");
    } finally {
      setUpdatingId(null);
    }
  }

  async function decide(bookingId: string, decision: "approve" | "reject") {
    setUpdatingId(bookingId);
    setError(null);
    try {
      await apiRequest(`/bookings/${bookingId}/${decision}`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${decision} booking`);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="provider-page">
      <h1>Class roster</h1>

      {error && <p className="form__error">{error}</p>}
      {!bookings && !error && <p className="page-status">Loading…</p>}
      {bookings && bookings.length === 0 && <p className="page-status">No one has booked this class yet.</p>}

      {bookings && bookings.length > 0 && (
        <ul className="activity-list">
          {bookings.map((booking) => (
            <li key={booking.id} className="activity-card">
              <div>
                <strong>
                  {booking.child.firstName} {booking.child.lastName}
                </strong>
                <div className="activity-card__meta">
                  Parent: {booking.parent.firstName} {booking.parent.lastName} ({booking.parent.email}) ·{" "}
                  {booking.status}
                </div>
              </div>
              {booking.status === "PENDING_APPROVAL" && (
                <div className="session-row__actions">
                  <button
                    type="button"
                    className="button"
                    disabled={updatingId === booking.id}
                    onClick={() => decide(booking.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={updatingId === booking.id}
                    onClick={() => decide(booking.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              )}
              {booking.status === "CONFIRMED" && (
                <div className="session-row__actions">
                  <button
                    type="button"
                    className="button"
                    disabled={updatingId === booking.id}
                    onClick={() => setStatus(booking.id, "ATTENDED")}
                  >
                    Mark attended
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={updatingId === booking.id}
                    onClick={() => setStatus(booking.id, "NO_SHOW")}
                  >
                    No-show
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
