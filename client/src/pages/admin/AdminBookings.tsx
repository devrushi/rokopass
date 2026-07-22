import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { AdminBooking, BookingStatus } from "../../lib/types";
import "../provider/provider.css";

const STATUS_OPTIONS: BookingStatus[] = [
  "PENDING_APPROVAL",
  "CONFIRMED",
  "CANCELLED",
  "REJECTED",
  "ATTENDED",
  "NO_SHOW",
];

export function AdminBookings() {
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load(query: { search?: string; status?: string } = {}) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.status) params.set("status", query.status);
    apiRequest<{ bookings: AdminBooking[]; total: number }>(`/admin/bookings?${params.toString()}`)
      .then((data) => {
        setBookings(data.bookings);
        setTotal(data.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load bookings"));
  }

  useEffect(() => {
    load();
  }, []);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    load({ search: search || undefined, status: status || undefined });
  }

  return (
    <div className="provider-page">
      <h1>Bookings</h1>

      <form className="form" onSubmit={handleSearch}>
        <div className="form-row">
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Child, parent, or activity…"
            />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="button">
          Search
        </button>
      </form>

      {error && <p className="form__error">{error}</p>}
      {!bookings && !error && <p className="page-status">Loading…</p>}
      {bookings && bookings.length === 0 && <p className="page-status">No bookings match.</p>}

      {bookings && bookings.length > 0 && (
        <>
          <p className="page-status">{total} total</p>
          <ul className="activity-list">
            {bookings.map((booking) => (
              <li key={booking.id} className="activity-card">
                <div>
                  <strong>{booking.session.activity.title}</strong>
                  <div className="activity-card__meta">
                    {booking.child.firstName} {booking.child.lastName} · parent: {booking.parent.firstName}{" "}
                    {booking.parent.lastName} ({booking.parent.email}) ·{" "}
                    {new Date(booking.session.startsAt).toLocaleString()}
                  </div>
                </div>
                <span className="activity-card__meta">
                  {booking.status} · {booking.creditsSpent} credits
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
