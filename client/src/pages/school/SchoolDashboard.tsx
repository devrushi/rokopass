import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { SchoolApprovalStatus, SchoolProviderListing } from "../../lib/types";
import "../provider/provider.css";

const STATUS_LABEL: Record<SchoolApprovalStatus, string> = {
  SHORTLISTED: "Shortlisted",
  APPROVED: "Approved for our school",
  REJECTED: "Not a fit",
};

export function SchoolDashboard() {
  const [providers, setProviders] = useState<SchoolProviderListing[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  function load(query: { search?: string } = {}) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    apiRequest<{ providers: SchoolProviderListing[] }>(`/schools/providers?${params.toString()}`)
      .then((data) => setProviders(data.providers))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load providers"));
  }

  useEffect(() => {
    load();
  }, []);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    load({ search: search || undefined });
  }

  async function setApproval(providerId: string, status: SchoolApprovalStatus) {
    setBusyId(providerId);
    setError(null);
    try {
      await apiRequest(`/schools/providers/${providerId}/approval`, {
        method: "PUT",
        body: { status, notes: notesById[providerId] || undefined },
      });
      load({ search: search || undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update approval");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="provider-page">
      <h1>Find Activity Providers</h1>
      <p className="page-status">
        Every provider here is already RokidsPass-verified — review their DBS record and mark
        your own approval decision to reduce your own vetting work.
      </p>

      <form className="form" onSubmit={handleSearch}>
        <div className="form-row">
          <label>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Provider name…" />
          </label>
        </div>
        <button type="submit" className="button">
          Search
        </button>
      </form>

      {error && <p className="form__error">{error}</p>}
      {!providers && !error && <p className="page-status">Loading…</p>}
      {providers && providers.length === 0 && <p className="page-status">No verified providers match.</p>}

      {providers && providers.length > 0 && (
        <ul className="activity-list">
          {providers.map((provider) => {
            const dbsExpired =
              provider.dbsCertificateExpiresAt && new Date(provider.dbsCertificateExpiresAt) < new Date();
            return (
              <li
                key={provider.id}
                className="activity-card"
                style={{ flexDirection: "column", alignItems: "stretch" }}
              >
                <div>
                  <strong>
                    {provider.firstName} {provider.lastName}
                    {provider.schoolStatus && ` · ${STATUS_LABEL[provider.schoolStatus]}`}
                  </strong>
                  <div className="activity-card__meta">
                    {provider.email}
                    {provider.whatsappNumber && ` · ${provider.whatsappNumber}`} ·{" "}
                    {provider.activeActivitiesCount} active activities
                    {provider.categories.length > 0 && ` · ${provider.categories.join(", ")}`}
                  </div>
                  {provider.dbsCertificateNumber ? (
                    <div className={dbsExpired ? "safety-note" : "activity-card__meta"}>
                      DBS: {provider.dbsCertificateNumber}
                      {provider.dbsCertificateExpiresAt &&
                        ` · expires ${new Date(provider.dbsCertificateExpiresAt).toLocaleDateString()}`}
                      {dbsExpired && " (EXPIRED)"}
                    </div>
                  ) : (
                    <div className="safety-note">⚠ No DBS certificate on file</div>
                  )}
                </div>
                <div className="form-row" style={{ alignItems: "flex-end" }}>
                  <label style={{ flex: 2 }}>
                    Notes (optional)
                    <input
                      value={notesById[provider.id] ?? provider.schoolNotes ?? ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({ ...prev, [provider.id]: e.target.value }))
                      }
                    />
                  </label>
                  <div className="session-row__actions">
                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={busyId === provider.id}
                      onClick={() => setApproval(provider.id, "SHORTLISTED")}
                    >
                      Shortlist
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={busyId === provider.id}
                      onClick={() => setApproval(provider.id, "APPROVED")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="button button--danger"
                      disabled={busyId === provider.id}
                      onClick={() => setApproval(provider.id, "REJECTED")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
