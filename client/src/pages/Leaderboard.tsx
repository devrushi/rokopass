import { useEffect, useState } from "react";
import { apiAssetUrl, apiRequest, ApiError } from "../lib/apiClient";
import type { LeaderboardEntry } from "../lib/types";
import "../components/ActivityCard.css";
import "./provider/provider.css";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

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
        your child and an optional photo from the Children page.
      </p>

      {error && <p className="form__error">{error}</p>}
      {!entries && !error && <p className="page-status">Loading…</p>}
      {entries && entries.length === 0 && (
        <p className="page-status">No one's on the leaderboard yet.</p>
      )}

      {entries && entries.length > 0 && (
        <div className="browse-grid">
          {entries.map((entry, index) => (
            <div key={`${entry.displayName}-${index}`} className="browse-card">
              <div className="browse-card__image">
                {entry.photoUrl ? (
                  <img src={apiAssetUrl(entry.photoUrl)} alt="" />
                ) : (
                  <div className="browse-card__image-fallback browse-card__image-fallback--leaderboard">
                    {RANK_MEDALS[index] ?? "🏅"}
                  </div>
                )}
                <span className="browse-card__age-badge">#{index + 1}</span>
                <span className="browse-card__credit-badge">
                  {entry.attendedCount} class{entry.attendedCount === 1 ? "" : "es"}
                </span>
              </div>
              <div className="browse-card__body">
                <div className="browse-card__title">{entry.displayName}</div>
                <div className="browse-card__tags">
                  <span className="browse-card__tag browse-card__tag--age">
                    {RANK_MEDALS[index] ?? "🏅"} Rank #{index + 1}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
