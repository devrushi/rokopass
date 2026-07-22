import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { AdminPlan, PlanAudience } from "../../lib/types";
import "../provider/provider.css";

interface PlanFormState {
  audience: PlanAudience;
  name: string;
  description: string;
  priceGbp: string;
  monthlyCredits: string;
  maxActiveActivities: string;
  stripePriceId: string;
}

const EMPTY_FORM: PlanFormState = {
  audience: "PARENT",
  name: "",
  description: "",
  priceGbp: "",
  monthlyCredits: "",
  maxActiveActivities: "",
  stripePriceId: "",
};

function toPence(pounds: string): number {
  return Math.round(Number(pounds) * 100);
}

function toPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function AdminPlans() {
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [audienceFilter, setAudienceFilter] = useState<PlanAudience | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<PlanFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PlanFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  function load(audience: PlanAudience | "" = audienceFilter) {
    const params = new URLSearchParams();
    if (audience) params.set("audience", audience);
    apiRequest<{ plans: AdminPlan[] }>(`/admin/plans?${params.toString()}`)
      .then((data) => setPlans(data.plans))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load plans"));
  }

  useEffect(() => {
    load();
  }, []);

  function handleFilterChange(audience: PlanAudience | "") {
    setAudienceFilter(audience);
    load(audience);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      await apiRequest("/admin/plans", {
        method: "POST",
        body: {
          audience: createForm.audience,
          name: createForm.name,
          description: createForm.description,
          priceGbp: toPence(createForm.priceGbp || "0"),
          monthlyCredits:
            createForm.audience === "PARENT" && createForm.monthlyCredits
              ? Number(createForm.monthlyCredits)
              : undefined,
          maxActiveActivities: createForm.maxActiveActivities ? Number(createForm.maxActiveActivities) : undefined,
          stripePriceId: createForm.stripePriceId || undefined,
        },
      });
      setCreateForm(EMPTY_FORM);
      setShowCreateForm(false);
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create plan");
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(plan: AdminPlan) {
    setEditingId(plan.id);
    setEditError(null);
    setEditForm({
      audience: plan.audience,
      name: plan.name,
      description: plan.description,
      priceGbp: toPounds(plan.priceGbp),
      monthlyCredits: plan.monthlyCredits === null ? "" : String(plan.monthlyCredits),
      maxActiveActivities: plan.maxActiveActivities === null ? "" : String(plan.maxActiveActivities),
      stripePriceId: plan.stripePriceId ?? "",
    });
  }

  async function handleEditSave(event: FormEvent, planId: string) {
    event.preventDefault();
    setEditError(null);
    setBusyId(planId);
    try {
      await apiRequest(`/admin/plans/${planId}`, {
        method: "PATCH",
        body: {
          name: editForm.name,
          description: editForm.description,
          priceGbp: toPence(editForm.priceGbp || "0"),
          monthlyCredits: editForm.monthlyCredits ? Number(editForm.monthlyCredits) : null,
          maxActiveActivities: editForm.maxActiveActivities ? Number(editForm.maxActiveActivities) : null,
          stripePriceId: editForm.stripePriceId || null,
        },
      });
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to update plan");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(plan: AdminPlan) {
    setBusyId(plan.id);
    setError(null);
    try {
      await apiRequest(`/admin/plans/${plan.id}`, { method: "PATCH", body: { isActive: !plan.isActive } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update plan");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(plan: AdminPlan) {
    setBusyId(plan.id);
    setError(null);
    try {
      await apiRequest(`/admin/plans/${plan.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete plan");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="provider-page">
      <div className="provider-page__header">
        <h1>Plans</h1>
        <button type="button" className="button" onClick={() => setShowCreateForm((v) => !v)}>
          {showCreateForm ? "Cancel" : "New plan"}
        </button>
      </div>

      <div className="session-row__actions">
        <button
          type="button"
          className={`button ${audienceFilter === "" ? "" : "button--secondary"}`}
          onClick={() => handleFilterChange("")}
        >
          All
        </button>
        <button
          type="button"
          className={`button ${audienceFilter === "PARENT" ? "" : "button--secondary"}`}
          onClick={() => handleFilterChange("PARENT")}
        >
          Parent
        </button>
        <button
          type="button"
          className={`button ${audienceFilter === "PROVIDER" ? "" : "button--secondary"}`}
          onClick={() => handleFilterChange("PROVIDER")}
        >
          Provider
        </button>
      </div>

      {showCreateForm && (
        <form className="form" onSubmit={handleCreate}>
          <label>
            Audience
            <select
              value={createForm.audience}
              onChange={(e) => setCreateForm((f) => ({ ...f, audience: e.target.value as PlanAudience }))}
            >
              <option value="PARENT">Parent (credit pack)</option>
              <option value="PROVIDER">Provider (business tier)</option>
            </select>
          </label>
          <label>
            Name
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              required
            />
          </label>
          <label>
            Price (GBP)
            <input
              type="number"
              step="0.01"
              min="0"
              value={createForm.priceGbp}
              onChange={(e) => setCreateForm((f) => ({ ...f, priceGbp: e.target.value }))}
              required
            />
          </label>
          {createForm.audience === "PARENT" && (
            <>
              <label>
                Monthly credits
                <input
                  type="number"
                  min="1"
                  value={createForm.monthlyCredits}
                  onChange={(e) => setCreateForm((f) => ({ ...f, monthlyCredits: e.target.value }))}
                  required
                />
              </label>
              <label>
                Stripe price ID
                <input
                  value={createForm.stripePriceId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, stripePriceId: e.target.value }))}
                  placeholder="price_..."
                />
              </label>
            </>
          )}
          {createForm.audience === "PROVIDER" && (
            <label>
              Max active activities (blank = unlimited)
              <input
                type="number"
                min="1"
                value={createForm.maxActiveActivities}
                onChange={(e) => setCreateForm((f) => ({ ...f, maxActiveActivities: e.target.value }))}
              />
            </label>
          )}
          {createError && <p className="form__error">{createError}</p>}
          <button type="submit" className="button" disabled={isCreating}>
            {isCreating ? "Creating…" : "Create plan"}
          </button>
        </form>
      )}

      {error && <p className="form__error">{error}</p>}
      {!plans && !error && <p className="page-status">Loading…</p>}
      {plans && plans.length === 0 && <p className="page-status">No plans match.</p>}

      {plans && plans.length > 0 && (
        <ul className="activity-list">
          {plans.map((plan) =>
            editingId === plan.id ? (
              <li key={plan.id} className="activity-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <form className="form" onSubmit={(e) => handleEditSave(e, plan.id)}>
                  <label>
                    Name
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Price (GBP)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.priceGbp}
                      onChange={(e) => setEditForm((f) => ({ ...f, priceGbp: e.target.value }))}
                      required
                    />
                  </label>
                  {plan.audience === "PARENT" && (
                    <>
                      <label>
                        Monthly credits
                        <input
                          type="number"
                          min="1"
                          value={editForm.monthlyCredits}
                          onChange={(e) => setEditForm((f) => ({ ...f, monthlyCredits: e.target.value }))}
                        />
                      </label>
                      <label>
                        Stripe price ID
                        <input
                          value={editForm.stripePriceId}
                          onChange={(e) => setEditForm((f) => ({ ...f, stripePriceId: e.target.value }))}
                        />
                      </label>
                    </>
                  )}
                  {plan.audience === "PROVIDER" && (
                    <label>
                      Max active activities (blank = unlimited)
                      <input
                        type="number"
                        min="1"
                        value={editForm.maxActiveActivities}
                        onChange={(e) => setEditForm((f) => ({ ...f, maxActiveActivities: e.target.value }))}
                      />
                    </label>
                  )}
                  {editError && <p className="form__error">{editError}</p>}
                  <div className="session-row__actions">
                    <button type="submit" className="button" disabled={busyId === plan.id}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => setEditingId(null)}
                      disabled={busyId === plan.id}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={plan.id} className="activity-card">
                <div>
                  <strong>
                    {plan.name} <span className="activity-card__meta">({plan.audience})</span>
                    {!plan.isActive && " · INACTIVE"}
                  </strong>
                  <div className="activity-card__meta">{plan.description}</div>
                  <div className="activity-card__meta">
                    £{toPounds(plan.priceGbp)}
                    {plan.audience === "PARENT" && plan.monthlyCredits !== null && (
                      <> · {plan.monthlyCredits} credits/mo</>
                    )}
                    {plan.audience === "PROVIDER" && (
                      <> · {plan.maxActiveActivities === null ? "unlimited" : plan.maxActiveActivities} activities</>
                    )}
                  </div>
                </div>
                <div className="session-row__actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={busyId === plan.id}
                    onClick={() => startEdit(plan)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={busyId === plan.id}
                    onClick={() => toggleActive(plan)}
                  >
                    {plan.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={busyId === plan.id}
                    onClick={() => handleDelete(plan)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
