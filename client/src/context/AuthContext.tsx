import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/apiClient";
import { clearTokens, getAccessToken, setTokens } from "../lib/tokenStorage";

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: "PARENT" | "PROVIDER";
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      setIsLoading(false);
      return;
    }

    apiRequest<{ user: UserProfile }>("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function register(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: "PARENT" | "PROVIDER";
  }) {
    const data = await apiRequest<AuthResponse>("/auth/register", {
      method: "POST",
      body: input,
      skipAuth: true,
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  function logout() {
    clearTokens();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
