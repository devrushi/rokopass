import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Child } from "../../lib/types";
import "../provider/provider.css";

export function Children() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [allergyInfo, setAllergyInfo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAllergyInfo, setEditAllergyInfo] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingLeaderboardId, setTogglingLeaderboardId] = useState<string | null>(null);

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
      await apiRequest("/children", {
        method: "POST",
        body: { firstName, lastName, dateOfBirth, allergyInfo: allergyInfo.trim() || null },
      });
      setFirstName("");
      setLastName("");
      setDateOfBirth("");
      setAllergyInfo("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add child");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(child: Child) {
    setEditingId(child.id);
    setEditAllergyInfo(child.allergyInfo ?? "");
    setEditError(null);
  }

  async function handleSaveAllergyInfo(event: FormEvent, childId: string) {
    event.preventDefault();
    setEditError(null);
    setIsSaving(true);
    try {
      await apiRequest(`/children/${childId}`, {
        method: "PATCH",
        body: { allergyInfo: editAllergyInfo.trim() || null },
      });
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to save allergy info");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleLeaderboard(child: Child) {
    setTogglingLeaderboardId(child.id);
    setError(null);
    try {
      await apiRequest(`/children/${child.id}`, {
        method: "PATCH",
        body: { isOnLeaderboard: !child.isOnLeaderboard },
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update leaderboard setting");
    } finally {
      setTogglingLeaderboardId(null);
    }
  }

  return (
    <div className="provider-page">
      <h1>My children</h1>

      {children && children.length > 0 && (
        <ul className="activity-list">
          {children.map((child) =>
            editingId === child.id ? (
              <li key={child.id} className="activity-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <form className="form" onSubmit={(e) => handleSaveAllergyInfo(e, child.id)}>
                  <strong>
                    {child.firstName} {child.lastName}
                  </strong>
                  <label>
                    Allergy / medical info (only shared with the provider running a booked session)
                    <textarea
                      value={editAllergyInfo}
                      onChange={(e) => setEditAllergyInfo(e.target.value)}
                      placeholder="e.g. Peanut allergy — carries an EpiPen"
                      maxLength={2000}
                    />
                  </label>
                  {editError && <p className="form__error">{editError}</p>}
                  <div className="session-row__actions">
                    <button type="submit" className="button" disabled={isSaving}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => setEditingId(null)}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={child.id} className="activity-card">
                <div>
                  <strong>
                    {child.firstName} {child.lastName}
                  </strong>
                  <div className="activity-card__meta">
                    Born {new Date(child.dateOfBirth).toLocaleDateString()}
                    {child.allergyInfo && " · has allergy/medical info on file"}
                    {child.isOnLeaderboard && " · on the leaderboard"}
                  </div>
                </div>
                <div className="session-row__actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={togglingLeaderboardId === child.id}
                    onClick={() => toggleLeaderboard(child)}
                  >
                    {child.isOnLeaderboard ? "Remove from leaderboard" : "Add to leaderboard"}
                  </button>
                  <button type="button" className="button button--secondary" onClick={() => startEdit(child)}>
                    {child.allergyInfo ? "Edit allergy info" : "Add allergy info"}
                  </button>
                </div>
              </li>
            ),
          )}
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
          <label>
            Allergy / medical info (optional — only shared with the provider running a booked
            session)
            <textarea
              value={allergyInfo}
              onChange={(e) => setAllergyInfo(e.target.value)}
              placeholder="e.g. Peanut allergy — carries an EpiPen"
              maxLength={2000}
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
