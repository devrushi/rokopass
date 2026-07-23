import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiAssetUrl, apiRequest, ApiError } from "../../lib/apiClient";
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
        <ul className="activity-list">
          {activities.map((activity) => {
            const cover = activity.media.find((m) => m.type === "ACTIVITY_PHOTO");
            return (
              <li key={activity.id}>
                <Link to={`/browse/${activity.id}`} className="activity-card">
                  {cover && (
                    <img
                      src={apiAssetUrl(cover.url)}
                      alt=""
                      className="activity-card__thumb"
                      width={64}
                      height={64}
                    />
                  )}
                  <div>
                    <strong>
                      {activity.title}
                      {activity.isSendFriendly && " · SEND-friendly"}
                    </strong>
                    <div className="activity-card__meta">
                      {activity.category} · {activity.ageGroup.label} · {activity.location}
                    </div>
                  </div>
                  <div className="activity-card__meta">{activity.creditCost} credits / class</div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
