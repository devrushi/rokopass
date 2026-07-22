import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, ApiError } from "../lib/apiClient";

interface SessionStatus {
  status: string | null;
  paymentStatus: string | null;
}

export function BillingReturn() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [result, setResult] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing checkout session.");
      return;
    }
    apiRequest<SessionStatus>(`/billing/checkout-session/${sessionId}/status`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to confirm checkout"));
  }, [sessionId]);

  if (error) {
    return <p className="form__error">{error}</p>;
  }

  if (!result) {
    return <p className="page-status">Confirming your subscription…</p>;
  }

  if (result.status === "complete") {
    return (
      <div>
        <h1>You're subscribed!</h1>
        <p className="page-status">Your credits are ready to use.</p>
        <Link to="/dashboard" className="button">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1>Checkout not completed</h1>
      <p className="page-status">Status: {result.status ?? "unknown"}</p>
      <Link to="/plans" className="button">
        Back to plans
      </Link>
    </div>
  );
}
