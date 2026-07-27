import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiAssetUrl, apiRequest, ApiError } from "../../lib/apiClient";
import type { ActivityWithProviderContact, Booking, Child, ClassSession } from "../../lib/types";
import "../provider/provider.css";
import "./booking.css";

// Deep link to WhatsApp — not a real Business API integration (that needs Meta developer
// credentials this project doesn't have), just the standard "message a business" pattern most
// small platforms use. Falls back to nothing if the provider hasn't set a number.
function whatsappChatUrl(number: string, activityTitle: string): string {
  const digitsOnly = number.replace(/[^\d]/g, "");
  const message = `Hi! I have a question about "${activityTitle}" on RokidsPass.`;
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

export function ActivityBrowseDetail() {
  const { id } = useParams<{ id: string }>();
  const [activity, setActivity] = useState<ActivityWithProviderContact | null>(null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bookingSessionId, setBookingSessionId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Booking | null>(null);

  useEffect(() => {
    if (!id) return;
    apiRequest<{ activity: ActivityWithProviderContact }>(`/activities/${id}`, { skipAuth: true }).then(
      (data) => setActivity(data.activity),
    );
    apiRequest<{ sessions: ClassSession[] }>(`/activities/${id}/sessions`, { skipAuth: true }).then((data) =>
      setSessions(data.sessions.filter((s) => !s.isCancelled)),
    );
    apiRequest<{ children: Child[] }>("/children/mine").then((data) => {
      setChildren(data.children);
      if (data.children.length > 0) setSelectedChildId(data.children[0].id);
    });
  }, [id]);

  async function book(sessionId: string) {
    if (!selectedChildId) {
      setError("Add a child before booking.");
      return;
    }
    setError(null);
    setConfirmation(null);
    setBookingSessionId(sessionId);
    try {
      const data = await apiRequest<{ booking: Booking; balance: number }>("/bookings", {
        method: "POST",
        body: { childId: selectedChildId, sessionId },
      });
      setConfirmation(data.booking);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Booking failed");
    } finally {
      setBookingSessionId(null);
    }
  }

  if (!activity) {
    return <p className="page-status">{error ?? "Loading…"}</p>;
  }

  const activityPhotos = activity.media.filter((m) => m.type === "ACTIVITY_PHOTO");
  const staffPhotos = activity.media.filter((m) => m.type === "STAFF_PHOTO");

  return (
    <div className="provider-page">
      <div className="provider-page__header">
        <div>
          <h1>{activity.title}</h1>
          <p className="activity-card__meta">
            {activity.category} · {activity.ageGroup.label} · {activity.location} ·{" "}
            {activity.creditCost} credits per class
            {activity.isSendFriendly && " · SEND-friendly"}
          </p>
        </div>
        <div className="session-row__actions">
          {activity.provider.websiteUrl && (
            <a
              href={activity.provider.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button button--secondary"
            >
              Website
            </a>
          )}
          <a href={`mailto:${activity.provider.email}`} className="button button--secondary">
            Email
          </a>
          {activity.provider.phoneNumber && (
            <a href={`tel:${activity.provider.phoneNumber.replace(/[^\d+]/g, "")}`} className="button button--secondary">
              Call {activity.provider.phoneNumber}
            </a>
          )}
          {activity.provider.instagramUrl && (
            <a
              href={activity.provider.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button button--secondary"
            >
              Instagram
            </a>
          )}
          {activity.provider.facebookUrl && (
            <a
              href={activity.provider.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button button--secondary"
            >
              Facebook
            </a>
          )}
          {activity.provider.tiktokUrl && (
            <a
              href={activity.provider.tiktokUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button button--secondary"
            >
              TikTok
            </a>
          )}
          {activity.provider.whatsappNumber && (
            <a
              href={whatsappChatUrl(activity.provider.whatsappNumber, activity.title)}
              target="_blank"
              rel="noopener noreferrer"
              className="button"
            >
              Chat on WhatsApp
            </a>
          )}
        </div>
      </div>

      <p>{activity.description}</p>

      {activityPhotos.length > 0 && (
        <div className="media-grid">
          {activityPhotos.map((photo) => (
            <div className="media-grid__item" key={photo.id}>
              <img src={apiAssetUrl(photo.url)} alt={photo.caption ?? activity.title} />
            </div>
          ))}
        </div>
      )}

      {staffPhotos.length > 0 && (
        <>
          <h2>Meet the team</h2>
          <div className="media-grid">
            {staffPhotos.map((photo) => (
              <div className="media-grid__item" key={photo.id}>
                <img src={apiAssetUrl(photo.url)} alt={photo.caption ?? "Staff member"} />
                {photo.caption && <div className="media-grid__meta">{photo.caption}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {confirmation && (
        <div className="booking-confirmation">
          <h2>Booking requested!</h2>
          <p>
            {confirmation.child.firstName}'s spot for{" "}
            {new Date(confirmation.session.startsAt).toLocaleString()} is awaiting the provider's
            approval. Your credits are held until they respond.
          </p>
          <Link to="/bookings" className="button">
            View my bookings
          </Link>
        </div>
      )}

      {children.length === 0 ? (
        <p className="page-status">
          You need to <Link to="/children">add a child</Link> before booking.
        </p>
      ) : (
        <label>
          Booking for
          <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.firstName} {child.lastName}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="form__error">{error}</p>}

      <h2>Upcoming classes</h2>
      {sessions.length === 0 && <p className="page-status">No upcoming classes scheduled.</p>}
      <ul className="activity-list">
        {sessions.map((session) => (
          <li key={session.id} className="activity-card">
            <span>{new Date(session.startsAt).toLocaleString()}</span>
            <button
              type="button"
              className="button"
              disabled={bookingSessionId === session.id || children.length === 0}
              onClick={() => book(session.id)}
            >
              {bookingSessionId === session.id ? "Booking…" : "Book"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
