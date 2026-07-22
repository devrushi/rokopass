import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { AdminProvider } from "../../lib/types";
import "../provider/provider.css";

export function PendingProviders() {
  const [providers, setProviders] = useState<AdminProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  function load() {
    apiRequest<{ providers: AdminProvider[] }>("/admin/providers?status=PENDING")
      .then((data) => setProviders(data.providers))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load providers"));
  }

  useEffect(load, []);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await apiRequest(`/admin/providers/${id}/approve`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve provider");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await apiRequest(`/admin/providers/${id}/reject`, {
        method: "POST",
        body: { reason: reasonById[id] || undefined },
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject provider");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="provider-page">
      <h1>Pending providers</h1>

      {error && <p className="form__error">{error}</p>}
      {!providers && !error && <p className="page-status">Loading…</p>}
      {providers && providers.length === 0 && <p className="page-status">No pending providers.</p>}

      {providers && providers.length > 0 && (
        <ul className="activity-list">
          {providers.map((provider) => (
            <li key={provider.id} className="activity-card">
              <div>
                <strong>
                  {provider.firstName} {provider.lastName}
                </strong>
                <div className="activity-card__meta">
                  {provider.email} · applied {new Date(provider.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="session-row__actions">
                <input
                  placeholder="Rejection reason (optional)"
                  value={reasonById[provider.id] ?? ""}
                  onChange={(e) => setReasonById((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="button"
                  disabled={busyId === provider.id}
                  onClick={() => approve(provider.id)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={busyId === provider.id}
                  onClick={() => reject(provider.id)}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
