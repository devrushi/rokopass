import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest, ApiError } from "../lib/apiClient";
import { getStripe } from "../lib/stripe";

export function Checkout() {
  const { planId } = useParams<{ planId: string }>();
  const [error, setError] = useState<string | null>(null);
  const stripePromise = useMemo(() => getStripe(), []);

  const fetchClientSecret = useCallback(async () => {
    try {
      const data = await apiRequest<{ clientSecret: string }>("/billing/checkout-session", {
        method: "POST",
        body: { planId },
      });
      return data.clientSecret;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start checkout");
      throw err;
    }
  }, [planId]);

  if (error) {
    return <p className="form__error">{error}</p>;
  }

  return (
    <div>
      <h1>Checkout</h1>
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
