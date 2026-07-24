import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/Modal";
import { apiAssetUrl, apiRequest, ApiError } from "../../lib/apiClient";
import type { ExpenseCategory, ProviderExpense } from "../../lib/types";
import "./provider.css";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  COST_OF_GOODS: "Cost of goods",
  CAR_VAN_TRAVEL: "Car, van & travel",
  STAFF_WAGES: "Staff wages",
  RENT_RATES_UTILITIES: "Rent, rates & utilities",
  REPAIRS_MAINTENANCE: "Repairs & maintenance",
  ADVERTISING_MARKETING: "Advertising & marketing",
  LEGAL_PROFESSIONAL: "Legal & professional fees",
  OFFICE_ADMIN: "Office & admin",
  OTHER: "Other",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ExpenseCategory[];

interface FormState {
  category: ExpenseCategory;
  description: string;
  amountGbp: string;
  incurredOn: string;
}

function emptyForm(): FormState {
  return {
    category: "OTHER",
    description: "",
    amountGbp: "",
    incurredOn: new Date().toISOString().slice(0, 10),
  };
}

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function Expenses() {
  const [expenses, setExpenses] = useState<ProviderExpense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  function load() {
    apiRequest<{ expenses: ProviderExpense[] }>("/accounting/expenses")
      .then((data) => setExpenses(data.expenses))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load expenses"));
  }

  useEffect(load, []);

  function openModal() {
    setForm(emptyForm());
    setFormError(null);
    setReceiptFile(null);
    setIsModalOpen(true);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const data = await apiRequest<{ expense: ProviderExpense }>("/accounting/expenses", {
        method: "POST",
        body: {
          category: form.category,
          description: form.description,
          amountGbp: Math.round(Number(form.amountGbp) * 100),
          incurredOn: form.incurredOn,
        },
      });

      if (receiptFile) {
        const fileData = new FormData();
        fileData.append("file", receiptFile);
        await apiRequest(`/accounting/expenses/${data.expense.id}/receipt`, { method: "POST", body: fileData });
      }

      setIsModalOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(expense: ProviderExpense) {
    setBusyId(expense.id);
    setError(null);
    try {
      await apiRequest(`/accounting/expenses/${expense.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete expense");
    } finally {
      setBusyId(null);
    }
  }

  const total = expenses?.reduce((sum, e) => sum + e.amountGbp, 0) ?? 0;

  return (
    <div className="provider-page">
      <div className="provider-page__header">
        <h1>Expenses</h1>
        <button type="button" className="button" onClick={openModal}>
          Add expense
        </button>
      </div>
      <p className="page-status">
        Log your own business expenses here — categories match HMRC's self-employment expense categories, so this
        list maps straight onto a Self Assessment return. Nothing here is verified or shared automatically; it's
        your own record.
      </p>

      {error && <p className="form__error">{error}</p>}
      {!expenses && !error && <p className="page-status">Loading…</p>}
      {expenses && expenses.length === 0 && <p className="page-status">No expenses logged yet.</p>}

      {expenses && expenses.length > 0 && (
        <>
          <p className="page-status">
            <strong>{expenses.length}</strong> expenses totalling <strong>{gbp(total)}</strong>
          </p>
          <ul className="activity-list">
            {expenses.map((expense) => (
              <li key={expense.id} className="activity-card">
                <div>
                  <strong>{expense.description}</strong>
                  <div className="activity-card__meta">
                    {CATEGORY_LABELS[expense.category]} · {new Date(expense.incurredOn).toLocaleDateString("en-GB")} ·{" "}
                    {gbp(expense.amountGbp)}
                  </div>
                </div>
                <div className="session-row__actions">
                  {expense.receiptUrl && (
                    <a
                      href={apiAssetUrl(expense.receiptUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button--secondary"
                    >
                      Receipt
                    </a>
                  )}
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={busyId === expense.id}
                    onClick={() => handleDelete(expense)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {isModalOpen && (
        <Modal title="Add expense" onClose={() => setIsModalOpen(false)}>
          <form className="form" onSubmit={handleCreate}>
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Amount (GBP)
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.amountGbp}
                  onChange={(e) => setForm((f) => ({ ...f, amountGbp: e.target.value }))}
                  required
                />
              </label>
              <label>
                Date incurred
                <input
                  type="date"
                  value={form.incurredOn}
                  onChange={(e) => setForm((f) => ({ ...f, incurredOn: e.target.value }))}
                  required
                />
              </label>
            </div>
            <label>
              Receipt (optional)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {formError && <p className="form__error">{formError}</p>}
            <button type="submit" className="button" disabled={saving}>
              {saving ? "Saving…" : "Save expense"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
