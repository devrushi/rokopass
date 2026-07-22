import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Activity, PendingBooking } from "../../lib/types";
import "./provider.css";

export function ProviderDashboard() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [pending, setPending] = useState<PendingBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadPending() {
    apiRequest<{ bookings: PendingBooking[] }>("/bookings/pending-approval")
      .then((data) => setPending(data.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load bookings"));
  }

  useEffect(() => {
    apiRequest<{ activities: Activity[] }>("/activities/mine")
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activities"));
    loadPending();
  }, []);

  async function decide(bookingId: string, decision: "approve" | "reject") {
    setBusyId(bookingId);
    setError(null);
    try {
      await apiRequest(`/bookings/${bookingId}/${decision}`, { method: "POST" });
      loadPending();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${decision} booking`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="provider-page">
      <div className="provider-page__header">
        <h1>Provider Dashboard</h1>
        <Link to="/provider/activities/new" className="button">
          New activity
        </Link>
      </div>

      {error && <p className="form__error">{error}</p>}

      <section>
        <h2>Bookings awaiting your approval</h2>
        {!pending && <p className="page-status">Loading…</p>}
        {pending && pending.length === 0 && <p className="page-status">Nothing to review right now.</p>}
        {pending && pending.length > 0 && (
          <ul className="activity-list">
            {pending.map((booking) => (
              <li key={booking.id} className="activity-card">
                <div>
                  <strong>
                    {booking.child.firstName} {booking.child.lastName}
                  </strong>
                  <div className="activity-card__meta">
                    {booking.session.activity.title} ·{" "}
                    {new Date(booking.session.startsAt).toLocaleString()} · parent:{" "}
                    {booking.parent.firstName} {booking.parent.lastName} ({booking.parent.email})
                  </div>
                </div>
                <div className="session-row__actions">
                  <button
                    type="button"
                    className="button"
                    disabled={busyId === booking.id}
                    onClick={() => decide(booking.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={busyId === booking.id}
                    onClick={() => decide(booking.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="provider-page__header">
          <h2>Your activities</h2>
          <Link to="/provider/activities">View all</Link>
        </div>
        {!activities && <p className="page-status">Loading…</p>}
        {activities && activities.length === 0 && (
          <p className="page-status">You haven't created any activities yet.</p>
        )}
        {activities && activities.length > 0 && (
          <ul className="activity-list">
            {activities.slice(0, 5).map((activity) => (
              <li key={activity.id}>
                <Link to={`/provider/activities/${activity.id}`} className="activity-card">
                  <strong>{activity.title}</strong>
                  <span className="activity-card__meta">
                    {activity.category} · {activity.creditCost} credits · capacity {activity.capacity}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
