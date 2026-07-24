import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ActivityCard } from "../../components/ActivityCard";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Activity } from "../../lib/types";
import "./provider.css";

export function ActivitiesList() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ activities: Activity[] }>("/activities/mine")
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activities"));
  }, []);

  return (
    <div className="provider-page">
      <div className="provider-page__header">
        <h1>My activities</h1>
        <Link to="/provider/activities/new" className="button">
          New activity
        </Link>
      </div>

      {error && <p className="form__error">{error}</p>}

      {!activities && !error && <p className="page-status">Loading…</p>}

      {activities && activities.length === 0 && (
        <p className="page-status">You haven't created any activities yet.</p>
      )}

      {activities && activities.length > 0 && (
        <div className="browse-grid">
          {activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} linkTo={`/provider/activities/${activity.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
