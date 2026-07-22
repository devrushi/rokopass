import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, ApiError } from "../lib/apiClient";
import type { Plan } from "../lib/types";
import "./Plans.css";

export function Plans() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ plans: Plan[] }>("/billing/plans", { skipAuth: true })
      .then((data) => setPlans(data.plans))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load plans"));
  }, []);

  function subscribe(planId: string) {
    setSubscribingId(planId);
    navigate(`/billing/checkout/${planId}`);
  }

  return (
    <div>
      <h1>Membership plans</h1>
      <p className="page-status">Credits refill every month — use them to book any activity.</p>

      {error && <p className="form__error">{error}</p>}
      {!plans && !error && <p className="page-status">Loading…</p>}

      <div className="plans-grid">
        {plans?.map((plan) => (
          <div className="plan-card" key={plan.id}>
            <h2>{plan.name}</h2>
            <p className="plan-card__price">£{(plan.priceGbp / 100).toFixed(2)}/mo</p>
            <p>{plan.description}</p>
            <p className="plan-card__credits">{plan.monthlyCredits} credits / month</p>
            <button
              type="button"
              className="button"
              disabled={subscribingId === plan.id}
              onClick={() => subscribe(plan.id)}
            >
              Subscribe
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
