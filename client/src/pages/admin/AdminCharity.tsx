import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/Modal";
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
  const [isModalOpen, setIsModalOpen] = useState(false);

  function load() {
    apiRequest<CharityPoolStats>("/admin/charity")
      .then((data) => setStats(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load charity data"));
  }

  useEffect(load, []);

  function openModal() {
    setError(null);
    setMessage(null);
    setEmail("");
    setAmount("1");
    setIsModalOpen(true);
  }

  async function handleGrant(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsGranting(true);
    try {
      await apiRequest("/admin/charity/grant", { method: "POST", body: { email, amount: Number(amount) } });
      setIsModalOpen(false);
      setMessage(`Granted ${amount} credits to ${email}.`);
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
            <button type="button" className="button" onClick={openModal}>
              Grant credits
            </button>
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

      {isModalOpen && (
        <Modal title="Grant credits to a family" onClose={() => setIsModalOpen(false)}>
          <form className="form" onSubmit={handleGrant}>
            <label>
              Parent email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
                autoFocus
                required
              />
            </label>
            <label>
              Credits
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            {error && <p className="form__error">{error}</p>}
            <button type="submit" className="button" disabled={isGranting}>
              {isGranting ? "Granting…" : "Confirm grant"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
