import { useEffect, useState, type FormEvent } from "react";
import { StatRow, StatTile } from "../../components/analytics/StatTile";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { CharityPoolStats } from "../../lib/types";
import "../provider/provider.css";

export function AdminCharity() {
  const [stats, setStats] = useState<CharityPoolStats | null>(null);
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isGranting, setIsGranting] = useState(false);

  function load() {
    apiRequest<CharityPoolStats>("/admin/charity")
      .then((data) => setStats(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load charity data"));
  }

  useEffect(load, []);

  async function handleGrant(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsGranting(true);
    try {
      await apiRequest("/admin/charity/grant", { method: "POST", body: { email, amount: Number(amount) } });
      setMessage(`Granted ${amount} credits to ${email}.`);
      setEmail("");
      setAmount("1");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to grant credits");
    } finally {
      setIsGranting(false);
    }
  }

  return (
    <div className="provider-page">
      <h1>Community Fund</h1>

      {error && <p className="form__error">{error}</p>}
      {!stats && !error && <p className="page-status">Loading…</p>}

      {stats && (
        <>
          <StatRow>
            <StatTile label="Available to grant" value={String(stats.poolBalance)} hint="credits" />
            <StatTile label="Total donated" value={String(stats.totalDonated)} hint="credits" />
            <StatTile label="Total granted" value={String(stats.totalGranted)} hint="credits" />
          </StatRow>

          <section>
            <h2>Grant credits to a family</h2>
            <p className="page-status">
              Redistributes credits from the community fund to a parent's account — for families
              who need help affording activities.
            </p>
            <form className="form-row" onSubmit={handleGrant} style={{ alignItems: "flex-end" }}>
              <label style={{ flex: 2 }}>
                Parent email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parent@example.com"
                  required
                />
              </label>
              <label>
                Credits
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ width: "6rem" }}
                />
              </label>
              <button type="submit" className="button" disabled={isGranting}>
                {isGranting ? "Granting…" : "Grant"}
              </button>
            </form>
            {message && <p className="page-status">{message}</p>}
          </section>

          <section>
            <h2>Recent donations</h2>
            {stats.recentDonations.length === 0 && <p className="page-status">No donations yet.</p>}
            {stats.recentDonations.length > 0 && (
              <ul className="activity-list">
                {stats.recentDonations.map((d) => (
                  <li key={d.id} className="activity-card">
                    <span>
                      {d.donorFirstName} {d.donorLastName}
                    </span>
                    <span className="activity-card__meta">
                      {d.amount} credits · {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Recent grants</h2>
            {stats.recentGrants.length === 0 && <p className="page-status">No grants issued yet.</p>}
            {stats.recentGrants.length > 0 && (
              <ul className="activity-list">
                {stats.recentGrants.map((g) => (
                  <li key={g.id} className="activity-card">
                    <span>
                      {g.recipientFirstName} {g.recipientLastName}
                    </span>
                    <span className="activity-card__meta">
                      {g.amount} credits · {new Date(g.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
