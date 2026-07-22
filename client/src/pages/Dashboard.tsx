import { useEffect, useState } from "react";
import { useAuth, type UserProfile } from "../context/AuthContext";
import { apiRequest, ApiError } from "../lib/apiClient";
import "./Dashboard.css";

export function Dashboard() {
  const { user: sessionUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    apiRequest<{ user: UserProfile }>("/auth/me")
      .then((data) => {
        if (!cancelled) setProfile(data.user);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load profile");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <p className="page-status">Loading your profile…</p>;
  }

  if (error || !profile) {
    return <p className="page-status">{error ?? "Profile unavailable."}</p>;
  }

  return (
    <div>
      <h1>Welcome, {sessionUser?.firstName ?? profile.firstName}</h1>
      <p className="page-status">Here's what we have on file for you.</p>

      <dl className="dashboard__card">
        <div className="dashboard__row">
          <dt>Name</dt>
          <dd>
            {profile.firstName} {profile.lastName}
          </dd>
        </div>
        <div className="dashboard__row">
          <dt>Email</dt>
          <dd>{profile.email}</dd>
        </div>
        <div className="dashboard__row">
          <dt>Role</dt>
          <dd>{profile.role}</dd>
        </div>
        <div className="dashboard__row">
          <dt>Member since</dt>
          <dd>{new Date(profile.createdAt).toLocaleDateString()}</dd>
        </div>
      </dl>
    </div>
  );
}
