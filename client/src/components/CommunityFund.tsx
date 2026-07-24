import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../lib/apiClient";
import type { CharityPoolStats } from "../lib/types";
import { Modal } from "./Modal";

export function CommunityFund() {
  const [stats, setStats] = useState<CharityPoolStats | null>(null);
  const [amount, setAmount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isDonating, setIsDonating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  function load() {
    apiRequest<CharityPoolStats>("/billing/charity")
      .then((data) => setStats(data))
      .catch(() => {
        // Non-critical panel — a failed fetch shouldn't block the rest of the dashboard.
      });
  }

  useEffect(load, []);

  function openModal() {
    setError(null);
    setMessage(null);
    setAmount("1");
    setIsModalOpen(true);
  }

  async function handleDonate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsDonating(true);
    try {
      await apiRequest("/billing/charity/donate", { method: "POST", body: { amount: Number(amount) } });
      setIsModalOpen(false);
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
      <button type="button" className="button button--secondary" onClick={openModal}>
        Donate
      </button>
      {message && <p className="page-status">{message}</p>}

      {isModalOpen && (
        <Modal title="Donate credits" onClose={() => setIsModalOpen(false)}>
          <form className="form" onSubmit={handleDonate}>
            <label>
              How many credits would you like to donate?
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </label>
            {error && <p className="form__error">{error}</p>}
            <button type="submit" className="button" disabled={isDonating}>
              {isDonating ? "Donating…" : "Confirm donation"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
