import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ActivityModeration } from "./pages/admin/ActivityModeration";
import { PendingProviders } from "./pages/admin/PendingProviders";
import { BillingReturn } from "./pages/BillingReturn";
import { Checkout } from "./pages/Checkout";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { ActivityBrowseDetail } from "./pages/parent/ActivityBrowseDetail";
import { Browse } from "./pages/parent/Browse";
import { Children } from "./pages/parent/Children";
import { MyBookings } from "./pages/parent/MyBookings";
import { Plans } from "./pages/Plans";
import { ActivitiesList } from "./pages/provider/ActivitiesList";
import { ActivityDetail } from "./pages/provider/ActivityDetail";
import { ActivityForm } from "./pages/provider/ActivityForm";
import { Roster } from "./pages/provider/Roster";
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
          path="/plans"
          element={
            <ProtectedRoute>
              <Plans />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/checkout/:planId"
          element={
            <ProtectedRoute>
              <Checkout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/return"
          element={
            <ProtectedRoute>
              <BillingReturn />
            </ProtectedRoute>
          }
        />
        <Route
          path="/children"
          element={
            <ProtectedRoute roles={["PARENT", "ADMIN"]}>
              <Children />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse"
          element={
            <ProtectedRoute roles={["PARENT", "ADMIN"]}>
              <Browse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse/:id"
          element={
            <ProtectedRoute roles={["PARENT", "ADMIN"]}>
              <ActivityBrowseDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute roles={["PARENT", "ADMIN"]}>
              <MyBookings />
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
        <Route
          path="/provider/sessions/:sessionId/roster"
          element={
            <ProtectedRoute roles={["PROVIDER", "ADMIN"]}>
              <Roster />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/providers"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <PendingProviders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/activities"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ActivityModeration />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
