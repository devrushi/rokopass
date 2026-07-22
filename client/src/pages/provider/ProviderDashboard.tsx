import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BarList } from "../../components/analytics/BarList";
import { StatRow, StatTile } from "../../components/analytics/StatTile";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { bookingsByStatusToBarItems } from "../../lib/bookingStatusDisplay";
import type { Activity, PendingBooking, ProviderAnalytics } from "../../lib/types";
import "./provider.css";

export function ProviderDashboard() {
  const { user, refreshUser } = useAuth();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [pending, setPending] = useState<PendingBooking[] | null>(null);
  const [analytics, setAnalytics] = useState<ProviderAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [whatsappNumber, setWhatsappNumber] = useState(user?.whatsappNumber ?? "");
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);

  function loadPending() {
    apiRequest<{ bookings: PendingBooking[] }>("/bookings/pending-approval")
      .then((data) => setPending(data.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load bookings"));
  }

  useEffect(() => {
    apiRequest<{ activities: Activity[] }>("/activities/mine")
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activities"));
    apiRequest<ProviderAnalytics>("/analytics/provider")
      .then((data) => setAnalytics(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load analytics"));
    loadPending();
  }, []);

  useEffect(() => {
    setWhatsappNumber(user?.whatsappNumber ?? "");
  }, [user?.whatsappNumber]);

  async function handleSaveWhatsapp(event: FormEvent) {
    event.preventDefault();
    setWhatsappError(null);
    setIsSavingWhatsapp(true);
    try {
      await apiRequest("/auth/me", {
        method: "PATCH",
        body: { whatsappNumber: whatsappNumber.trim() || null },
      });
      await refreshUser();
    } catch (err) {
      setWhatsappError(err instanceof ApiError ? err.message : "Failed to save WhatsApp number");
    } finally {
      setIsSavingWhatsapp(false);
    }
  }

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

      {analytics && (
        <section>
          <h2>Your performance</h2>
          <StatRow>
            <StatTile label="Activities" value={String(analytics.totalActivities)} />
            <StatTile
              label="Attendance rate"
              value={analytics.attendanceRatePercent === null ? "—" : `${analytics.attendanceRatePercent}%`}
            />
            <StatTile
              label="Capacity utilization"
              value={
                analytics.avgCapacityUtilizationPercent === null
                  ? "—"
                  : `${analytics.avgCapacityUtilizationPercent}%`
              }
            />
            <StatTile
              label="Avg. approval time"
              value={
                analytics.avgApprovalResponseMinutes === null
                  ? "—"
                  : `${analytics.avgApprovalResponseMinutes} min`
              }
            />
            <StatTile
              label="Repeat bookings"
              value={analytics.repeatBookingRatePercent === null ? "—" : `${analytics.repeatBookingRatePercent}%`}
            />
          </StatRow>

          {Object.keys(analytics.bookingsByStatus).length > 0 && (
            <>
              <h3>Bookings by status</h3>
              <BarList items={bookingsByStatusToBarItems(analytics.bookingsByStatus)} />
            </>
          )}

          {analytics.topActivities.length > 0 && (
            <>
              <h3>Top activities</h3>
              <BarList
                items={analytics.topActivities.map((a) => ({ label: a.title, value: a.bookingsCount }))}
                formatValue={(v) => `${v} bookings`}
              />
            </>
          )}
        </section>
      )}

      <section>
        <h2>WhatsApp contact number</h2>
        <p className="page-status">
          Parents browsing your activities will see a "Chat on WhatsApp" button if you set a
          number.
        </p>
        <form className="form" onSubmit={handleSaveWhatsapp}>
          <label>
            WhatsApp number (international format)
            <input
              type="tel"
              placeholder="+441234567890"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
            />
          </label>
          {whatsappError && <p className="form__error">{whatsappError}</p>}
          <button type="submit" className="button" disabled={isSavingWhatsapp}>
            {isSavingWhatsapp ? "Saving…" : "Save"}
          </button>
        </form>
      </section>

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
