import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Child } from "../../lib/types";
import "../provider/provider.css";

export function Children() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function load() {
    apiRequest<{ children: Child[] }>("/children/mine")
      .then((data) => setChildren(data.children))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load children"));
  }

  useEffect(load, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiRequest("/children", { method: "POST", body: { firstName, lastName, dateOfBirth } });
      setFirstName("");
      setLastName("");
      setDateOfBirth("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add child");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="provider-page">
      <h1>My children</h1>

      {children && children.length > 0 && (
        <ul className="activity-list">
          {children.map((child) => (
            <li key={child.id} className="activity-card">
              <div>
                <strong>
                  {child.firstName} {child.lastName}
                </strong>
                <div className="activity-card__meta">
                  Born {new Date(child.dateOfBirth).toLocaleDateString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {children && children.length === 0 && <p className="page-status">No children added yet.</p>}

      <section>
        <h2>Add a child</h2>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              First name
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </label>
            <label>
              Last name
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </label>
          </div>
          <label>
            Date of birth
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
            />
          </label>

          {error && <p className="form__error">{error}</p>}

          <button type="submit" className="button" disabled={isSubmitting}>
            {isSubmitting ? "Adding…" : "Add child"}
          </button>
        </form>
      </section>
    </div>
  );
}
