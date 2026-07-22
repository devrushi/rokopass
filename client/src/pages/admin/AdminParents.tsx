import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { AdminParent } from "../../lib/types";
import "../provider/provider.css";

export function AdminParents() {
  const [parents, setParents] = useState<AdminParent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load(query: { search?: string } = {}) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    apiRequest<{ parents: AdminParent[]; total: number }>(`/admin/parents?${params.toString()}`)
      .then((data) => {
        setParents(data.parents);
        setTotal(data.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load parents"));
  }

  useEffect(() => {
    load();
  }, []);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    load({ search: search || undefined });
  }

  return (
    <div className="provider-page">
      <h1>Parents</h1>

      <form className="form" onSubmit={handleSearch}>
        <div className="form-row">
          <label>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email…" />
          </label>
        </div>
        <button type="submit" className="button">
          Search
        </button>
      </form>

      {error && <p className="form__error">{error}</p>}
      {!parents && !error && <p className="page-status">Loading…</p>}
      {parents && parents.length === 0 && <p className="page-status">No parents match.</p>}

      {parents && parents.length > 0 && (
        <>
          <p className="page-status">{total} total</p>
          <ul className="activity-list">
            {parents.map((parent) => (
              <li key={parent.id} className="activity-card">
                <div>
                  <strong>
                    {parent.firstName} {parent.lastName}
                  </strong>
                  <div className="activity-card__meta">{parent.email}</div>
                </div>
                <span className="activity-card__meta">
                  {parent._count.children} children · {parent._count.bookings} bookings · joined{" "}
                  {new Date(parent.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
