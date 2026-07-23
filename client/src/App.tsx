import { Navigate, Route, Routes } from "react-router-dom";
import { HomeRedirect } from "./components/HomeRedirect";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ActivityModeration } from "./pages/admin/ActivityModeration";
import { AdminBookings } from "./pages/admin/AdminBookings";
import { AdminChildren } from "./pages/admin/AdminChildren";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminParents } from "./pages/admin/AdminParents";
import { AdminPlans } from "./pages/admin/AdminPlans";
import { PendingProviders } from "./pages/admin/PendingProviders";
import { BillingReturn } from "./pages/BillingReturn";
import { Chat } from "./pages/Chat";
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
import { ProviderDashboard } from "./pages/provider/ProviderDashboard";
import { Roster } from "./pages/provider/Roster";
import { Register } from "./pages/Register";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={["PARENT"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/plans"
          element={
            <ProtectedRoute roles={["PARENT"]}>
              <Plans />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/checkout/:planId"
          element={
            <ProtectedRoute roles={["PARENT"]}>
              <Checkout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/return"
          element={
            <ProtectedRoute roles={["PARENT"]}>
              <BillingReturn />
            </ProtectedRoute>
          }
        />
        <Route
          path="/children"
          element={
            <ProtectedRoute roles={["PARENT"]}>
              <Children />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse"
          element={
            <ProtectedRoute roles={["PARENT"]}>
              <Browse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse/:id"
          element={
            <ProtectedRoute roles={["PARENT"]}>
              <ActivityBrowseDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute roles={["PARENT"]}>
              <MyBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/provider"
          element={
            <ProtectedRoute roles={["PROVIDER"]}>
              <ProviderDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/provider/activities"
          element={
            <ProtectedRoute roles={["PROVIDER"]}>
              <ActivitiesList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/provider/activities/new"
          element={
            <ProtectedRoute roles={["PROVIDER"]}>
              <ActivityForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/provider/activities/:id"
          element={
            <ProtectedRoute roles={["PROVIDER"]}>
              <ActivityDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/provider/sessions/:sessionId/roster"
          element={
            <ProtectedRoute roles={["PROVIDER"]}>
              <Roster />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute roles={["PARENT", "PROVIDER"]}>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminDashboard />
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
        <Route
          path="/admin/children"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminChildren />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/parents"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminParents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/bookings"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/plans"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminPlans />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
