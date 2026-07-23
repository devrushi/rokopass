import { useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import "./analytics.css";

interface AiInsightsProps {
  endpoint: string;
}

export function AiInsights({ endpoint }: AiInsightsProps) {
  const [insights, setInsights] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiRequest<{ insights: string }>(endpoint, { method: "POST" });
      setInsights(data.insights);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get AI insights");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="ai-insights">
      <button type="button" className="button button--secondary" onClick={handleClick} disabled={isLoading}>
        {isLoading ? "Thinking…" : insights ? "Refresh AI insights" : "Get AI insights"}
      </button>
      {error && <p className="form__error">{error}</p>}
      {insights && <div className="ai-insights__text">{insights}</div>}
    </div>
  );
}
