import { Link } from "react-router-dom";
import { apiAssetUrl } from "../lib/apiClient";
import type { Activity } from "../lib/types";
import "./ActivityCard.css";

const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSchedule(activity: Activity): string | null {
  const schedule = activity.recurringSchedules?.[0];
  if (!schedule) return null;
  return `${SHORT_DAY_NAMES[schedule.dayOfWeek]} ${schedule.startTime} · ${schedule.durationMinutes} min`;
}

interface ActivityCardProps {
  activity: Activity;
  linkTo: string;
}

export function ActivityCard({ activity, linkTo }: ActivityCardProps) {
  const cover = activity.media.find((m) => m.type === "ACTIVITY_PHOTO");
  const schedule = formatSchedule(activity);
  const { minAge, maxAge } = activity.ageGroup;

  return (
    <Link to={linkTo} className="browse-card">
      <div className="browse-card__image">
        {cover ? (
          <img src={apiAssetUrl(cover.url)} alt="" />
        ) : (
          <div className="browse-card__image-fallback" aria-hidden="true" />
        )}
        <span className="browse-card__age-badge">
          Ages {minAge}–{maxAge}
        </span>
        <span className="browse-card__credit-badge">{activity.creditCost} credits</span>
      </div>
      <div className="browse-card__body">
        <div className="browse-card__title">{activity.title}</div>
        <div className="browse-card__meta">
          {activity.location}
          {schedule && <> · {schedule}</>}
        </div>
        <div className="browse-card__tags">
          <span className="browse-card__tag browse-card__tag--age">
            Ages {minAge}–{maxAge}
          </span>
          <span className="browse-card__tag browse-card__tag--cat">{activity.category}</span>
          {activity.isSendFriendly && (
            <span className="browse-card__tag browse-card__tag--send">SEND-friendly</span>
          )}
        </div>
      </div>
    </Link>
  );
}
