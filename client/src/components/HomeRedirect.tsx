import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Where "/" (and any unmatched route, via the catch-all) sends a signed-in user — providers
// land on their own dashboard rather than the parent-oriented generic one.
export function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <p className="page-status">Loading…</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "PROVIDER") {
    return <Navigate to="/provider" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}
