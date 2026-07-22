import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Activity } from "../../lib/types";
import "../provider/provider.css";

export function Browse() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ activities: Activity[] }>("/activities", { skipAuth: true })
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activities"));
  }, []);

  return (
    <div className="provider-page">
      <h1>Browse activities</h1>

      {error && <p className="form__error">{error}</p>}
      {!activities && !error && <p className="page-status">Loading…</p>}
      {activities && activities.length === 0 && <p className="page-status">No activities yet.</p>}

      {activities && activities.length > 0 && (
        <ul className="activity-list">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link to={`/browse/${activity.id}`} className="activity-card">
                <div>
                  <strong>{activity.title}</strong>
                  <div className="activity-card__meta">
                    {activity.category} · {activity.ageGroup.label} · {activity.location}
                  </div>
                </div>
                <div className="activity-card__meta">{activity.creditCost} credits / class</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
