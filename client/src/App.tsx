import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { ActivitiesList } from "./pages/provider/ActivitiesList";
import { ActivityDetail } from "./pages/provider/ActivityDetail";
import { ActivityForm } from "./pages/provider/ActivityForm";
import { Register } from "./pages/Register";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/provider/activities"
          element={
            <ProtectedRoute roles={["PROVIDER", "ADMIN"]}>
              <ActivitiesList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/provider/activities/new"
          element={
            <ProtectedRoute roles={["PROVIDER", "ADMIN"]}>
              <ActivityForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/provider/activities/:id"
          element={
            <ProtectedRoute roles={["PROVIDER", "ADMIN"]}>
              <ActivityDetail />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
