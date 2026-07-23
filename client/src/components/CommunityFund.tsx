import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../lib/apiClient";
import type { CharityPoolStats } from "../lib/types";

export function CommunityFund() {
  const [stats, setStats] = useState<CharityPoolStats | null>(null);
  const [amount, setAmount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isDonating, setIsDonating] = useState(false);

  function load() {
    apiRequest<CharityPoolStats>("/billing/charity")
      .then((data) => setStats(data))
      .catch(() => {
        // Non-critical panel — a failed fetch shouldn't block the rest of the dashboard.
      });
  }

  useEffect(load, []);

  async function handleDonate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsDonating(true);
    try {
      await apiRequest("/billing/charity/donate", { method: "POST", body: { amount: Number(amount) } });
      setMessage("Thank you for your donation!");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to donate");
    } finally {
      setIsDonating(false);
    }
  }

  if (!stats) return null;

  return (
    <section>
      <h2>Community Fund</h2>
      <p className="page-status">
        Donate spare credits to help families who can't otherwise afford activities. RokidsPass
        admins grant fund credits directly to families in need — {stats.poolBalance} credits
        available right now, {stats.totalDonated} donated all-time.
      </p>
      <form className="form-row" onSubmit={handleDonate} style={{ alignItems: "flex-end" }}>
        <label>
          Donate credits
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: "6rem" }}
          />
        </label>
        <button type="submit" className="button button--secondary" disabled={isDonating}>
          {isDonating ? "Donating…" : "Donate"}
        </button>
      </form>
      {error && <p className="form__error">{error}</p>}
      {message && <p className="page-status">{message}</p>}
    </section>
  );
}
