import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { AdminActivity, AuditLogEntry } from "../../lib/types";
import "../provider/provider.css";

export function ActivityModeration() {
  const [activities, setActivities] = useState<AdminActivity[] | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load(query: { search?: string; category?: string } = {}) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.category) params.set("category", query.category);
    apiRequest<{ activities: AdminActivity[] }>(`/admin/activities?${params.toString()}`)
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activities"));
  }

  function loadAuditLog() {
    apiRequest<{ entries: AuditLogEntry[] }>("/admin/audit-log?limit=10")
      .then((data) => setAuditLog(data.entries))
      .catch(() => {
        // Non-critical panel — a failed audit log fetch shouldn't block the moderation table.
      });
  }

  useEffect(() => {
    load();
    loadAuditLog();
  }, []);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    load({ search: search || undefined, category: category || undefined });
  }

  async function toggle(activity: AdminActivity, field: "isFlagged" | "isFeatured") {
    setBusyId(activity.id);
    setError(null);
    try {
      await apiRequest(`/admin/activities/${activity.id}/moderation`, {
        method: "PATCH",
        body: { [field]: !activity[field] },
      });
      load({ search: search || undefined, category: category || undefined });
      loadAuditLog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update activity");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="provider-page">
      <h1>Activity moderation</h1>

      <form className="form" onSubmit={handleSearch}>
        <div className="form-row">
          <label>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title contains…" />
          </label>
          <label>
            Category
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Swimming" />
          </label>
        </div>
        <button type="submit" className="button">
          Search
        </button>
      </form>

      {error && <p className="form__error">{error}</p>}
      {!activities && !error && <p className="page-status">Loading…</p>}
      {activities && activities.length === 0 && <p className="page-status">No activities match.</p>}

      {activities && activities.length > 0 && (
        <ul className="activity-list">
          {activities.map((activity) => (
            <li key={activity.id} className="activity-card">
              <div>
                <strong>{activity.title}</strong>
                <div className="activity-card__meta">
                  {activity.category} · provider: {activity.provider.firstName} {activity.provider.lastName} (
                  {activity.provider.verificationStatus ?? "n/a"})
                  {activity.isFlagged && " · FLAGGED"}
                  {activity.isFeatured && " · FEATURED"}
                </div>
              </div>
              <div className="session-row__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={busyId === activity.id}
                  onClick={() => toggle(activity, "isFlagged")}
                >
                  {activity.isFlagged ? "Unflag" : "Flag"}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={busyId === activity.id}
                  onClick={() => toggle(activity, "isFeatured")}
                >
                  {activity.isFeatured ? "Unfeature" : "Feature"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>Recent admin actions</h2>
      {auditLog.length === 0 && <p className="page-status">No admin actions yet.</p>}
      {auditLog.length > 0 && (
        <ul className="activity-list">
          {auditLog.map((entry) => (
            <li key={entry.id} className="activity-card">
              <span>
                {entry.admin.firstName} {entry.admin.lastName} · {entry.action} · {entry.targetType}/
                {entry.targetId.slice(0, 8)}
              </span>
              <span className="activity-card__meta">{new Date(entry.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
