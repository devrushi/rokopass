import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Layout.css";

export function Layout() {
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="layout">
      <header className="layout__header">
        <Link to="/" className="layout__brand" onClick={() => setNavOpen(false)}>
          RokidsPass
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
                <Link to="/provider/activities" onClick={() => setNavOpen(false)}>
                  My Activities
                </Link>
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
              <Link to="/login" onClick={() => setNavOpen(false)}>
                Log in
              </Link>
              <Link to="/register" onClick={() => setNavOpen(false)}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
