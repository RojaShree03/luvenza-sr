import { createContext, useContext, useMemo, useState } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

function normalizeUser(payload) {
  const candidate = payload?.user || payload?.data?.user || payload?.data || payload;
  return candidate?._id || candidate?.id ? candidate : null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("stylefit_user") || "null"); }
    catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("stylefit_token"));

  async function login(credentials) {
    const response = await api.post("/auth/login", credentials);
    const body = response.data;
    const receivedToken = body.token || body.accessToken || body.data?.token;
    const receivedUser = normalizeUser(body);
    if (!receivedToken || !receivedUser) {
      throw new Error("Login response must include a token and user object. Check your backend login response.");
    }
    localStorage.setItem("stylefit_token", receivedToken);
    localStorage.setItem("stylefit_user", JSON.stringify(receivedUser));
    setToken(receivedToken);
    setUser(receivedUser);
    return receivedUser;
  }

  function logout() {
    localStorage.removeItem("stylefit_token");
    localStorage.removeItem("stylefit_user");
    setToken(null);
    setUser(null);
  }

  const value = useMemo(() => ({ user, token, login, logout, isAuthenticated: Boolean(token && user) }), [user, token]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
