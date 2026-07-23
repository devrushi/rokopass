import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/apiClient";
import type { LeaderboardEntry } from "../lib/types";
import "./provider/provider.css";

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ entries: LeaderboardEntry[] }>("/leaderboard")
      .then((data) => setEntries(data.entries))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load leaderboard"));
  }, []);

  return (
    <div className="provider-page">
      <h1>Leaderboard</h1>
      <p className="page-status">
        Kids who attend the most classes — opt-in only, first name and last initial shown. Add
        your child from the Children page.
      </p>

      {error && <p className="form__error">{error}</p>}
      {!entries && !error && <p className="page-status">Loading…</p>}
      {entries && entries.length === 0 && (
        <p className="page-status">No one's on the leaderboard yet.</p>
      )}

      {entries && entries.length > 0 && (
        <ul className="activity-list">
          {entries.map((entry, index) => (
            <li key={`${entry.displayName}-${index}`} className="activity-card">
              <strong>
                #{index + 1} {entry.displayName}
              </strong>
              <span className="activity-card__meta">{entry.attendedCount} classes attended</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
