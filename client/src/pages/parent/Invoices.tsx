import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Invoice } from "../../lib/types";
import "../provider/provider.css";

export function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ invoices: Invoice[] }>("/billing/invoices")
      .then((data) => setInvoices(data.invoices))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load invoices"));
  }, []);

  return (
    <div className="provider-page">
      <h1>Invoices</h1>

      {error && <p className="form__error">{error}</p>}
      {!invoices && !error && <p className="page-status">Loading…</p>}
      {invoices && invoices.length === 0 && (
        <p className="page-status">No invoices yet — these appear after your first subscription payment.</p>
      )}

      {invoices && invoices.length > 0 && (
        <ul className="activity-list">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="activity-card">
              <div>
                <strong>{invoice.number ?? invoice.id}</strong>
                <div className="activity-card__meta">
                  {new Date(invoice.created).toLocaleDateString()} · {invoice.status} ·{" "}
                  {(invoice.amountPaid / 100).toFixed(2)} {invoice.currency.toUpperCase()}
                </div>
              </div>
              <div className="session-row__actions">
                {invoice.hostedInvoiceUrl && (
                  <a
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button--secondary"
                  >
                    View
                  </a>
                )}
                {invoice.invoicePdf && (
                  <a
                    href={invoice.invoicePdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button--secondary"
                  >
                    Download PDF
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
