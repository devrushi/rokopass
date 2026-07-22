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
              <Link to={user.role === "PROVIDER" ? "/provider" : "/dashboard"} onClick={() => setNavOpen(false)}>
                Dashboard
              </Link>
              <Link to="/plans" onClick={() => setNavOpen(false)}>
                Plans
              </Link>
              {(user.role === "PARENT" || user.role === "ADMIN") && (
                <>
                  <Link to="/browse" onClick={() => setNavOpen(false)}>
                    Browse Activities
                  </Link>
                  <Link to="/children" onClick={() => setNavOpen(false)}>
                    My Children
                  </Link>
                  <Link to="/bookings" onClick={() => setNavOpen(false)}>
                    My Bookings
                  </Link>
                </>
              )}
              {(user.role === "PROVIDER" || user.role === "ADMIN") && (
                <Link to="/provider/activities" onClick={() => setNavOpen(false)}>
                  My Activities
                </Link>
              )}
              {user.role === "ADMIN" && (
                <>
                  <Link to="/admin/providers" onClick={() => setNavOpen(false)}>
                    Pending Providers
                  </Link>
                  <Link to="/admin/activities" onClick={() => setNavOpen(false)}>
                    Moderate Activities
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
