import { useEffect, useState } from "react";
import { ActivityCard } from "../../components/ActivityCard";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Activity } from "../../lib/types";
import "../provider/provider.css";

export function Browse() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [sendFriendlyOnly, setSendFriendlyOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = sendFriendlyOnly ? "?sendFriendly=true" : "";
    apiRequest<{ activities: Activity[] }>(`/activities${query}`, { skipAuth: true })
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activities"));
  }, [sendFriendlyOnly]);

  return (
    <div className="provider-page">
      <h1>Browse activities</h1>

      <label className="form__checkbox">
        <input
          type="checkbox"
          checked={sendFriendlyOnly}
          onChange={(e) => setSendFriendlyOnly(e.target.checked)}
        />
        SEND-friendly only
      </label>

      {error && <p className="form__error">{error}</p>}
      {!activities && !error && <p className="page-status">Loading…</p>}
      {activities && activities.length === 0 && <p className="page-status">No activities yet.</p>}

      {activities && activities.length > 0 && (
        <div className="browse-grid">
          {activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} linkTo={`/browse/${activity.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
