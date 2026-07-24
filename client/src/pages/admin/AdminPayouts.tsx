import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { AdminPayoutStatement, AdminProvider, PlatformSettings } from "../../lib/types";
import "../provider/provider.css";

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function toPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

function toPence(pounds: string): number {
  return Math.round(Number(pounds) * 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function AdminPayouts() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    creditValueGbp: "",
    commissionRatePercent: "",
    platformLegalName: "",
    platformAddress: "",
    platformVatRegistered: false,
    platformVatNumber: "",
    platformVatRatePercent: "20",
  });
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [period, setPeriod] = useState(defaultPeriod());
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [statements, setStatements] = useState<AdminPayoutStatement[] | null>(null);
  const [statementsError, setStatementsError] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  function loadSettings() {
    apiRequest<{ settings: PlatformSettings }>("/admin/payouts/settings").then((data) => {
      setSettings(data.settings);
      setSettingsForm({
        creditValueGbp: toPounds(data.settings.creditValueGbp),
        commissionRatePercent: String(data.settings.commissionRatePercent),
        platformLegalName: data.settings.platformLegalName,
        platformAddress: data.settings.platformAddress,
        platformVatRegistered: data.settings.platformVatRegistered,
        platformVatNumber: data.settings.platformVatNumber ?? "",
        platformVatRatePercent: String(data.settings.platformVatRatePercent),
      });
    });
  }

  function loadProviders() {
    apiRequest<{ providers: AdminProvider[] }>("/admin/providers?status=APPROVED").then((data) =>
      setProviders(data.providers),
    );
  }

  function loadStatements() {
    setStatementsError(null);
    apiRequest<{ statements: AdminPayoutStatement[] }>("/admin/payouts?limit=50")
      .then((data) => setStatements(data.statements))
      .catch((err) => setStatementsError(err instanceof ApiError ? err.message : "Failed to load statements"));
  }

  useEffect(() => {
    loadSettings();
    loadProviders();
    loadStatements();
  }, []);

  async function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    setSettingsError(null);
    setSettingsSaved(false);
    setSettingsSaving(true);
    try {
      const data = await apiRequest<{ settings: PlatformSettings }>("/admin/payouts/settings", {
        method: "PATCH",
        body: {
          creditValueGbp: toPence(settingsForm.creditValueGbp),
          commissionRatePercent: Number(settingsForm.commissionRatePercent),
          platformLegalName: settingsForm.platformLegalName,
          platformAddress: settingsForm.platformAddress,
          platformVatRegistered: settingsForm.platformVatRegistered,
          platformVatNumber: settingsForm.platformVatNumber || null,
          platformVatRatePercent: Number(settingsForm.platformVatRatePercent),
        },
      });
      setSettings(data.settings);
      setSettingsSaved(true);
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleGenerateOne(event: FormEvent) {
    event.preventDefault();
    setGenerateError(null);
    setGenerateResult(null);
    if (!selectedProviderId) {
      setGenerateError("Choose a provider first");
      return;
    }
    setGenerating(true);
    try {
      const data = await apiRequest<{ statement: AdminPayoutStatement }>("/admin/payouts/generate", {
        method: "POST",
        body: { providerId: selectedProviderId, periodStart: period.start, periodEnd: period.end },
      });
      setGenerateResult(`Generated ${data.statement.statementNumber} — net ${gbp(data.statement.netAmountGbp)}`);
      loadStatements();
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : "Failed to generate payout statement");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateAll() {
    setGenerateError(null);
    setGenerateResult(null);
    setGenerating(true);
    try {
      const data = await apiRequest<{
        generated: AdminPayoutStatement[];
        skipped: { providerId: string; reason: string }[];
      }>("/admin/payouts/generate-all", {
        method: "POST",
        body: { periodStart: period.start, periodEnd: period.end },
      });
      setGenerateResult(
        `Generated ${data.generated.length} statement(s); skipped ${data.skipped.length} provider(s) with nothing eligible or no business profile.`,
      );
      loadStatements();
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : "Failed to generate payouts");
    } finally {
      setGenerating(false);
    }
  }

  async function handleExecute(statement: AdminPayoutStatement) {
    setExecutingId(statement.id);
    setStatementsError(null);
    try {
      await apiRequest(`/admin/payouts/${statement.id}/execute`, { method: "POST" });
      loadStatements();
    } catch (err) {
      setStatementsError(err instanceof ApiError ? err.message : "Failed to execute payout");
    } finally {
      setExecutingId(null);
    }
  }

  return (
    <div className="provider-page">
      <h1>Payouts</h1>

      <section className="accounting-section">
        <h2>Platform settings</h2>
        {settings && (
          <form className="form" onSubmit={handleSaveSettings}>
            <div className="form-row">
              <label>
                Credit value (GBP)
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={settingsForm.creditValueGbp}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, creditValueGbp: e.target.value }))}
                  required
                />
              </label>
              <label>
                Commission rate (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settingsForm.commissionRatePercent}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, commissionRatePercent: e.target.value }))}
                  required
                />
              </label>
            </div>
            <label>
              Platform legal name
              <input
                value={settingsForm.platformLegalName}
                onChange={(e) => setSettingsForm((f) => ({ ...f, platformLegalName: e.target.value }))}
                required
              />
            </label>
            <label>
              Platform address
              <input
                value={settingsForm.platformAddress}
                onChange={(e) => setSettingsForm((f) => ({ ...f, platformAddress: e.target.value }))}
                required
              />
            </label>
            <label className="form__checkbox">
              <input
                type="checkbox"
                checked={settingsForm.platformVatRegistered}
                onChange={(e) => setSettingsForm((f) => ({ ...f, platformVatRegistered: e.target.checked }))}
              />
              Platform is VAT-registered
            </label>
            {settingsForm.platformVatRegistered && (
              <div className="form-row">
                <label>
                  VAT number
                  <input
                    value={settingsForm.platformVatNumber}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, platformVatNumber: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  VAT rate (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settingsForm.platformVatRatePercent}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, platformVatRatePercent: e.target.value }))}
                  />
                </label>
              </div>
            )}
            {settingsError && <p className="form__error">{settingsError}</p>}
            {settingsSaved && <p className="page-status">Saved — takes effect on statements generated from now on.</p>}
            <button type="submit" className="button" disabled={settingsSaving}>
              {settingsSaving ? "Saving…" : "Save settings"}
            </button>
          </form>
        )}
      </section>

      <section className="accounting-section">
        <h2>Generate payouts</h2>
        <form className="form" onSubmit={handleGenerateOne}>
          <div className="form-row">
            <label>
              Period start
              <input
                type="date"
                value={period.start}
                onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
                required
              />
            </label>
            <label>
              Period end
              <input
                type="date"
                value={period.end}
                onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
                required
              />
            </label>
          </div>
          <label>
            Provider
            <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)}>
              <option value="">Choose a provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} ({p.email})
                </option>
              ))}
            </select>
          </label>
          {generateError && <p className="form__error">{generateError}</p>}
          {generateResult && <p className="page-status">{generateResult}</p>}
          <div className="session-row__actions">
            <button type="submit" className="button" disabled={generating}>
              {generating ? "Generating…" : "Generate for this provider"}
            </button>
            <button type="button" className="button button--secondary" onClick={handleGenerateAll} disabled={generating}>
              {generating ? "Generating…" : "Generate for all approved providers"}
            </button>
          </div>
        </form>
      </section>

      <section className="accounting-section">
        <h2>Statements</h2>
        {statementsError && <p className="form__error">{statementsError}</p>}
        {!statements && !statementsError && <p className="page-status">Loading…</p>}
        {statements && statements.length === 0 && <p className="page-status">No payout statements yet.</p>}
        {statements && statements.length > 0 && (
          <ul className="activity-list">
            {statements.map((statement) => (
              <li key={statement.id} className="activity-card">
                <div>
                  <strong>
                    {statement.statementNumber} · {statement.provider.firstName} {statement.provider.lastName}
                  </strong>
                  <div className="activity-card__meta">
                    {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)} · Net{" "}
                    {gbp(statement.netAmountGbp)} · {statement.status}
                    {statement.status === "FAILED" && statement.failureReason ? ` (${statement.failureReason})` : ""}
                  </div>
                </div>
                <div className="session-row__actions">
                  {statement.status !== "PAID" && (
                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={executingId === statement.id}
                      onClick={() => handleExecute(statement)}
                    >
                      {executingId === statement.id ? "Processing…" : "Execute payout"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
