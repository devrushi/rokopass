import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AiInsights } from "../../components/analytics/AiInsights";
import { BarList } from "../../components/analytics/BarList";
import { StatRow, StatTile } from "../../components/analytics/StatTile";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { bookingsByStatusToBarItems } from "../../lib/bookingStatusDisplay";
import type { AdminAnalytics } from "../../lib/types";
import "../provider/provider.css";

export function AdminDashboard() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<AdminAnalytics>("/admin/analytics")
      .then((data) => setAnalytics(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load analytics"));
  }, []);

  return (
    <div className="provider-page">
      <div className="provider-page__header">
        <h1>Admin Dashboard</h1>
        <div className="session-row__actions">
          <Link to="/admin/children" className="button">
            Children
          </Link>
          <Link to="/admin/parents" className="button">
            Parents
          </Link>
          <Link to="/admin/bookings" className="button">
            Bookings
          </Link>
          <Link to="/admin/activities" className="button">
            Activities
          </Link>
          <Link to="/admin/providers" className="button">
            Providers
          </Link>
          <Link to="/admin/plans" className="button">
            Plans
          </Link>
        </div>
      </div>

      {error && <p className="form__error">{error}</p>}
      {!analytics && !error && <p className="page-status">Loading…</p>}

      {analytics && (
        <>
          <h2>Platform overview</h2>
          <StatRow>
            <StatTile label="Parents" value={String(analytics.users.parents)} />
            <StatTile label="Providers" value={String(analytics.users.providers)} />
            <StatTile label="Admins" value={String(analytics.users.admins)} />
            <StatTile label="Active subscriptions" value={String(analytics.activeSubscriptions)} />
          </StatRow>
          <StatRow>
            <StatTile
              label="New parents (30d)"
              value={String(analytics.newSignupsLast30Days.parents)}
            />
            <StatTile
              label="New providers (30d)"
              value={String(analytics.newSignupsLast30Days.providers)}
            />
            <StatTile label="Pending providers" value={String(analytics.pendingProvidersCount)} />
            <StatTile
              label="Avg. approval time"
              value={
                analytics.avgProviderApprovalHours === null
                  ? "—"
                  : `${analytics.avgProviderApprovalHours} hrs`
              }
            />
          </StatRow>
          <StatRow>
            <StatTile label="Flagged activities" value={String(analytics.flaggedActivitiesCount)} />
            <StatTile label="Featured activities" value={String(analytics.featuredActivitiesCount)} />
            <StatTile label="Audit log volume (30d)" value={String(analytics.auditLogVolumeLast30Days)} />
          </StatRow>

          <AiInsights endpoint="/admin/analytics/insights" />

          {Object.keys(analytics.bookingsByStatus).length > 0 && (
            <>
              <h3>Bookings by status</h3>
              <BarList items={bookingsByStatusToBarItems(analytics.bookingsByStatus)} />
            </>
          )}

          {analytics.topCategories.length > 0 && (
            <>
              <h3>Top categories</h3>
              <BarList
                items={analytics.topCategories.map((c) => ({
                  label: c.category,
                  value: c.activityCount,
                }))}
                formatValue={(v) => `${v} activities`}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
