import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { AdminChild } from "../../lib/types";
import "../provider/provider.css";

export function AdminChildren() {
  const [children, setChildren] = useState<AdminChild[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load(query: { search?: string } = {}) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    apiRequest<{ children: AdminChild[]; total: number }>(`/admin/children?${params.toString()}`)
      .then((data) => {
        setChildren(data.children);
        setTotal(data.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load children"));
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
      <h1>Children</h1>

      <form className="form" onSubmit={handleSearch}>
        <div className="form-row">
          <label>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Child's name…" />
          </label>
        </div>
        <button type="submit" className="button">
          Search
        </button>
      </form>

      {error && <p className="form__error">{error}</p>}
      {!children && !error && <p className="page-status">Loading…</p>}
      {children && children.length === 0 && <p className="page-status">No children match.</p>}

      {children && children.length > 0 && (
        <>
          <p className="page-status">{total} total</p>
          <ul className="activity-list">
            {children.map((child) => (
              <li key={child.id} className="activity-card">
                <div>
                  <strong>
                    {child.firstName} {child.lastName}
                  </strong>
                  <div className="activity-card__meta">
                    born {new Date(child.dateOfBirth).toLocaleDateString()} · parent: {child.parent.firstName}{" "}
                    {child.parent.lastName} ({child.parent.email})
                  </div>
                </div>
                <span className="activity-card__meta">{child._count.bookings} bookings</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
