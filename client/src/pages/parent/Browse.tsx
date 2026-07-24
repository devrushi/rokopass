import { useEffect, useState } from "react";
import { ActivityCard } from "../../components/ActivityCard";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Activity } from "../../lib/types";
import "../provider/provider.css";

const CATEGORIES = [
  { label: "All", emoji: "✨" },
  { label: "Swimming", emoji: "🏊" },
  { label: "Football", emoji: "⚽" },
  { label: "Dance", emoji: "💃" },
  { label: "Art", emoji: "🎨" },
  { label: "Martial Arts", emoji: "🥋" },
  { label: "Music", emoji: "🎵" },
  { label: "Gymnastics", emoji: "🤸" },
  { label: "Other", emoji: "⭐" },
];

export function Browse() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [category, setCategory] = useState("All");
  const [sendFriendlyOnly, setSendFriendlyOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (sendFriendlyOnly) params.set("sendFriendly", "true");
    if (category !== "All") params.set("category", category);
    apiRequest<{ activities: Activity[] }>(`/activities?${params.toString()}`, { skipAuth: true })
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activities"));
  }, [sendFriendlyOnly, category]);

  return (
    <div className="provider-page">
      <h1>Browse activities</h1>

      <div className="category-chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`chip ${category === c.label ? "chip--active" : ""}`}
            onClick={() => setCategory(c.label)}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

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
      {activities && activities.length === 0 && <p className="page-status">No activities match.</p>}

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
