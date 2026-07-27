import { useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ChatWidget } from "./ChatWidget";
import "./Layout.css";

// A real seeded pitch-demo account (see prisma/seed-demo.ts) — unlike Login.tsx's "Quick login"
// buttons, this is deliberately available in production too, so a prospective client can try the
// live app from the marketing nav without registering. Picked a parent account specifically
// since that's the more visitor-relevant side of the product (booking activities) — a curious
// provider/admin can still register or use their own login.
const DEMO_LOGIN = { email: "david.brown@example.com", password: "PitchDemo123" };

export function Layout() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [demoLoginBusy, setDemoLoginBusy] = useState(false);

  async function handleDemoLogin() {
    setNavOpen(false);
    setDemoLoginBusy(true);
    try {
      await login(DEMO_LOGIN.email, DEMO_LOGIN.password);
      navigate("/dashboard");
    } catch {
      // Demo account missing/misconfigured in this environment — fall back to a normal login
      // rather than leaving the visitor stuck on a silent failure.
      navigate("/login");
    } finally {
      setDemoLoginBusy(false);
    }
  }

  return (
    <div className="layout">
      <header className="layout__header">
        <Link to="/" className="layout__brand" onClick={() => setNavOpen(false)}>
          <span className="layout__brand-badge">Ro</span>
          <span>
            kids<strong>Pass</strong>
          </span>
        </Link>

        <button
          type="button"
          className="layout__nav-toggle"
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={`layout__nav ${navOpen ? "layout__nav--open" : ""}`}>
          {user ? (
            <>
              <Link
                to={
                  user.role === "PROVIDER"
                    ? "/provider"
                    : user.role === "ADMIN"
                      ? "/admin"
                      : user.role === "SCHOOL"
                        ? "/school"
                        : "/dashboard"
                }
                onClick={() => setNavOpen(false)}
              >
                Dashboard
              </Link>
              <Link to="/leaderboard" onClick={() => setNavOpen(false)}>
                Leaderboard
              </Link>
              {user.role === "PARENT" && (
                <>
                  <Link to="/plans" onClick={() => setNavOpen(false)}>
                    Plans
                  </Link>
                  <Link to="/browse" onClick={() => setNavOpen(false)}>
                    Browse Activities
                  </Link>
                  <Link to="/children" onClick={() => setNavOpen(false)}>
                    My Children
                  </Link>
                  <Link to="/bookings" onClick={() => setNavOpen(false)}>
                    My Bookings
                  </Link>
                  <Link to="/billing/invoices" onClick={() => setNavOpen(false)}>
                    Invoices
                  </Link>
                </>
              )}
              {user.role === "PROVIDER" && (
                <>
                  <Link to="/provider/activities" onClick={() => setNavOpen(false)}>
                    My Activities
                  </Link>
                  <Link to="/provider/accounting" onClick={() => setNavOpen(false)}>
                    Accounting
                  </Link>
                  <Link to="/provider/expenses" onClick={() => setNavOpen(false)}>
                    Expenses
                  </Link>
                </>
              )}
              {(user.role === "PARENT" || user.role === "PROVIDER") && (
                <Link to="/chat" onClick={() => setNavOpen(false)}>
                  Ask AI
                </Link>
              )}
              {user.role === "ADMIN" && (
                <>
                  <Link to="/admin/children" onClick={() => setNavOpen(false)}>
                    Children
                  </Link>
                  <Link to="/admin/parents" onClick={() => setNavOpen(false)}>
                    Parents
                  </Link>
                  <Link to="/admin/bookings" onClick={() => setNavOpen(false)}>
                    Bookings
                  </Link>
                  <Link to="/admin/activities" onClick={() => setNavOpen(false)}>
                    Activities
                  </Link>
                  <Link to="/admin/providers" onClick={() => setNavOpen(false)}>
                    Providers
                  </Link>
                  <Link to="/admin/providers?role=SCHOOL" onClick={() => setNavOpen(false)}>
                    Schools
                  </Link>
                  <Link to="/admin/plans" onClick={() => setNavOpen(false)}>
                    Plans
                  </Link>
                  <Link to="/admin/charity" onClick={() => setNavOpen(false)}>
                    Charity
                  </Link>
                  <Link to="/admin/payouts" onClick={() => setNavOpen(false)}>
                    Payouts
                  </Link>
                </>
              )}
              <button
                type="button"
                className="layout__logout"
                onClick={() => {
                  setNavOpen(false);
                  logout();
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="layout__demo-link"
                onClick={handleDemoLogin}
                disabled={demoLoginBusy}
              >
                {demoLoginBusy ? "Loading demo…" : "Try the demo"}
              </button>
              <Link to="/login" onClick={() => setNavOpen(false)}>
                Log in
              </Link>
              <Link to="/register" className="button" onClick={() => setNavOpen(false)}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="layout__main">
        <Outlet />
      </main>

      <footer className="layout__footer">
        <span>
          <span className="layout__brand-badge">Ro</span> kids<strong>Pass</strong>
        </span>
        <span className="layout__footer-tag">A credit-based subscription for children's activities in Leicester.</span>
      </footer>

      <ChatWidget />
    </div>
  );
}
