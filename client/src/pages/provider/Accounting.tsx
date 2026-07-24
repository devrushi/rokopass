import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiDownload, apiRequest, ApiError, triggerBlobDownload } from "../../lib/apiClient";
import type { BusinessProfile, ConnectStatus, PayoutStatement, TaxYearSummary } from "../../lib/types";
import "./provider.css";

function currentTaxYear(): number {
  const now = new Date();
  const aprilSixth = new Date(now.getFullYear(), 3, 6);
  return now >= aprilSixth ? now.getFullYear() : now.getFullYear() - 1;
}

interface ProfileFormState {
  legalBusinessName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  utr: string;
  isVatRegistered: boolean;
  vatNumber: string;
  vatRatePercent: string;
}

const EMPTY_PROFILE_FORM: ProfileFormState = {
  legalBusinessName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
  utr: "",
  isVatRegistered: false,
  vatNumber: "",
  vatRatePercent: "20",
};

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function Accounting() {
  const [searchParams] = useSearchParams();

  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [taxYear, setTaxYear] = useState(currentTaxYear());
  const [summary, setSummary] = useState<TaxYearSummary | null>(null);
  const [statements, setStatements] = useState<PayoutStatement[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  function loadProfile() {
    apiRequest<{ profile: BusinessProfile | null }>("/accounting/business-profile").then((data) => {
      setProfile(data.profile);
      if (data.profile) {
        setProfileForm({
          legalBusinessName: data.profile.legalBusinessName,
          addressLine1: data.profile.addressLine1,
          addressLine2: data.profile.addressLine2 ?? "",
          city: data.profile.city,
          postcode: data.profile.postcode,
          utr: data.profile.utr ?? "",
          isVatRegistered: data.profile.isVatRegistered,
          vatNumber: data.profile.vatNumber ?? "",
          vatRatePercent: String(data.profile.vatRatePercent),
        });
      }
    });
  }

  function loadConnectStatus() {
    setConnectError(null);
    apiRequest<ConnectStatus>("/accounting/connect/status")
      .then(setConnectStatus)
      .catch((err) => setConnectError(err instanceof ApiError ? err.message : "Failed to load payout status"));
  }

  function loadStatementsAndSummary(year: number) {
    setListError(null);
    Promise.all([
      apiRequest<{ statements: PayoutStatement[] }>(`/accounting/statements?taxYear=${year}`),
      apiRequest<{ summary: TaxYearSummary }>(`/accounting/summary?taxYear=${year}`),
    ])
      .then(([statementsData, summaryData]) => {
        setStatements(statementsData.statements);
        setSummary(summaryData.summary);
      })
      .catch((err) => setListError(err instanceof ApiError ? err.message : "Failed to load payout statements"));
  }

  useEffect(() => {
    loadProfile();
    loadConnectStatus();
  }, []);

  useEffect(() => {
    loadStatementsAndSummary(taxYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear]);

  useEffect(() => {
    if (searchParams.get("connect")) {
      loadConnectStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      const data = await apiRequest<{ profile: BusinessProfile }>("/accounting/business-profile", {
        method: "PUT",
        body: {
          legalBusinessName: profileForm.legalBusinessName,
          addressLine1: profileForm.addressLine1,
          addressLine2: profileForm.addressLine2 || null,
          city: profileForm.city,
          postcode: profileForm.postcode,
          country: "GB",
          utr: profileForm.utr || null,
          isVatRegistered: profileForm.isVatRegistered,
          vatNumber: profileForm.vatNumber || null,
          vatRatePercent: Number(profileForm.vatRatePercent),
        },
      });
      setProfile(data.profile);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Failed to save business profile");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleConnectOnboarding() {
    setConnectBusy(true);
    setConnectError(null);
    try {
      const data = await apiRequest<{ url: string }>("/accounting/connect/onboarding-link", { method: "POST" });
      window.location.href = data.url;
    } catch (err) {
      setConnectError(err instanceof ApiError ? err.message : "Failed to start Stripe onboarding");
      setConnectBusy(false);
    }
  }

  async function downloadStatementPdf(statement: PayoutStatement) {
    setDownloadingId(statement.id);
    try {
      const blob = await apiDownload(`/accounting/statements/${statement.id}/pdf`);
      triggerBlobDownload(blob, `${statement.statementNumber}.pdf`);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Failed to download statement");
    } finally {
      setDownloadingId(null);
    }
  }

  async function downloadStatementsCsv() {
    try {
      const blob = await apiDownload(`/accounting/statements/export.csv?taxYear=${taxYear}`);
      triggerBlobDownload(blob, `payout-statements-${taxYear}-${taxYear + 1}.csv`);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Failed to export statements");
    }
  }

  const taxYearOptions = [currentTaxYear(), currentTaxYear() - 1, currentTaxYear() - 2, currentTaxYear() - 3];

  return (
    <div className="provider-page">
      <h1>Accounting</h1>
      <p className="page-status">
        Your business records for HMRC — a legal business identity, real bank payouts via Stripe, and a
        downloadable statement for every payout period. Not tax advice — a starting point for your own Self
        Assessment or accountant.
      </p>

      <section className="accounting-section">
        <h2>Business details</h2>
        <p className="page-status">Required before a payout statement can be generated for you.</p>
        <form className="form" onSubmit={handleSaveProfile}>
          <label>
            Legal business name
            <input
              value={profileForm.legalBusinessName}
              onChange={(e) => setProfileForm((f) => ({ ...f, legalBusinessName: e.target.value }))}
              required
            />
          </label>
          <label>
            Address line 1
            <input
              value={profileForm.addressLine1}
              onChange={(e) => setProfileForm((f) => ({ ...f, addressLine1: e.target.value }))}
              required
            />
          </label>
          <label>
            Address line 2 (optional)
            <input
              value={profileForm.addressLine2}
              onChange={(e) => setProfileForm((f) => ({ ...f, addressLine2: e.target.value }))}
            />
          </label>
          <div className="form-row">
            <label>
              City
              <input
                value={profileForm.city}
                onChange={(e) => setProfileForm((f) => ({ ...f, city: e.target.value }))}
                required
              />
            </label>
            <label>
              Postcode
              <input
                value={profileForm.postcode}
                onChange={(e) => setProfileForm((f) => ({ ...f, postcode: e.target.value }))}
                required
              />
            </label>
          </div>
          <label>
            UTR (HMRC Unique Taxpayer Reference, optional)
            <input value={profileForm.utr} onChange={(e) => setProfileForm((f) => ({ ...f, utr: e.target.value }))} />
          </label>
          <label className="form__checkbox">
            <input
              type="checkbox"
              checked={profileForm.isVatRegistered}
              onChange={(e) => setProfileForm((f) => ({ ...f, isVatRegistered: e.target.checked }))}
            />
            I'm VAT-registered
          </label>
          {profileForm.isVatRegistered && (
            <div className="form-row">
              <label>
                VAT number
                <input
                  value={profileForm.vatNumber}
                  onChange={(e) => setProfileForm((f) => ({ ...f, vatNumber: e.target.value }))}
                  placeholder="GB123456789"
                  required
                />
              </label>
              <label>
                VAT rate (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={profileForm.vatRatePercent}
                  onChange={(e) => setProfileForm((f) => ({ ...f, vatRatePercent: e.target.value }))}
                />
              </label>
            </div>
          )}
          {profileError && <p className="form__error">{profileError}</p>}
          {profileSaved && <p className="page-status">Saved.</p>}
          <button type="submit" className="button" disabled={profileSaving}>
            {profileSaving ? "Saving…" : profile ? "Save changes" : "Save business details"}
          </button>
        </form>
      </section>

      <section className="accounting-section">
        <h2>Payouts</h2>
        {connectError && <p className="form__error">{connectError}</p>}
        {!connectStatus && !connectError && <p className="page-status">Loading…</p>}
        {connectStatus && (
          <div className="accounting-connect-card">
            <div>
              {connectStatus.payoutsEnabled ? (
                <span className="badge badge--success">Payouts enabled</span>
              ) : connectStatus.connected ? (
                <span className="badge badge--warning">Verification pending</span>
              ) : (
                <span className="badge">Not set up</span>
              )}
              <p className="accounting-connect-card__hint">
                {connectStatus.payoutsEnabled
                  ? "Stripe can send your payout statements' net amount straight to your bank account."
                  : "Set up Stripe Connect so we can pay your statements directly into your bank account."}
              </p>
            </div>
            <button type="button" className="button button--secondary" onClick={handleConnectOnboarding} disabled={connectBusy}>
              {connectBusy ? "Redirecting…" : connectStatus.payoutsEnabled ? "Manage on Stripe" : "Set up payouts"}
            </button>
          </div>
        )}
      </section>

      <section className="accounting-section">
        <div className="provider-page__header">
          <h2>Tax year {taxYear}/{String(taxYear + 1).slice(-2)}</h2>
          <select value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
            {taxYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}/{String(y + 1).slice(-2)}
              </option>
            ))}
          </select>
        </div>

        {summary && (
          <div className="accounting-summary-grid">
            <div className="accounting-summary-card">
              <span className="accounting-summary-card__label">Gross income</span>
              <span className="accounting-summary-card__value">{gbp(summary.grossIncomeGbp)}</span>
            </div>
            <div className="accounting-summary-card">
              <span className="accounting-summary-card__label">Platform fees</span>
              <span className="accounting-summary-card__value">-{gbp(summary.platformFeesGbp)}</span>
            </div>
            <div className="accounting-summary-card">
              <span className="accounting-summary-card__label">Other expenses</span>
              <span className="accounting-summary-card__value">-{gbp(summary.otherExpensesGbp)}</span>
            </div>
            <div className="accounting-summary-card accounting-summary-card--highlight">
              <span className="accounting-summary-card__label">Net profit</span>
              <span className="accounting-summary-card__value">{gbp(summary.netProfitGbp)}</span>
            </div>
          </div>
        )}

        <div className="provider-page__header">
          <h3>Payout statements</h3>
          {statements && statements.length > 0 && (
            <button type="button" className="button button--secondary" onClick={downloadStatementsCsv}>
              Export CSV
            </button>
          )}
        </div>

        {listError && <p className="form__error">{listError}</p>}
        {!statements && !listError && <p className="page-status">Loading…</p>}
        {statements && statements.length === 0 && (
          <p className="page-status">No payout statements for this tax year yet.</p>
        )}
        {statements && statements.length > 0 && (
          <ul className="activity-list">
            {statements.map((statement) => (
              <li key={statement.id} className="activity-card">
                <div>
                  <strong>{statement.statementNumber}</strong>
                  <div className="activity-card__meta">
                    {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)} · {statement.creditsRedeemed}{" "}
                    credits · Net {gbp(statement.netAmountGbp)}
                  </div>
                  <div className="activity-card__meta">
                    {statement.status === "PAID" && `Paid ${statement.paidAt ? formatDate(statement.paidAt) : ""}`}
                    {statement.status === "PENDING" && "Awaiting payout"}
                    {statement.status === "FAILED" && `Payout failed: ${statement.failureReason ?? "unknown error"}`}
                  </div>
                </div>
                <div className="session-row__actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => downloadStatementPdf(statement)}
                    disabled={downloadingId === statement.id}
                  >
                    {downloadingId === statement.id ? "Downloading…" : "Download PDF"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
