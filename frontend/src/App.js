import React from "react";
import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import KanbanDashboard from "@/pages/KanbanDashboard";
import OnboardingRapide from "@/pages/OnboardingRapide";
import ActionsFormation from "@/pages/ActionsFormation";
import DossiersClotures from "@/pages/DossiersClotures";
import Sessions from "@/pages/Sessions";
import SessionDetail from "@/pages/SessionDetail";
import SessionCreate from "@/pages/SessionCreate";
import Facturation from "@/pages/Facturation";
import ApprenantDetail from "@/pages/ApprenantDetail";
import Apprenants from "@/pages/Apprenants";
import Formateurs from "@/pages/Formateurs";
import Entreprises from "@/pages/Entreprises";
import Financeurs from "@/pages/Financeurs";
import Lieux from "@/pages/Lieux";
import Parametres from "@/pages/Parametres";
import Layout from "@/components/Layout";

function AuthCallback() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = React.useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const sessionId = params.get("session_id");
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    (async () => {
      try {
        const { data } = await api.post("/auth/emergent/session", { session_id: sessionId });
        setUser(data);
        navigate("/dashboard", { replace: true });
      } catch (e) {
        navigate("/login?error=oauth", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-600">
      Authentification en cours…
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500" data-testid="auth-loading">
        Chargement…
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/kanban" element={<KanbanDashboard />} />
        <Route path="/onboarding" element={<OnboardingRapide />} />
        <Route path="/actions" element={<ActionsFormation />} />
        <Route path="/archives" element={<DossiersClotures />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/new" element={<SessionCreate />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/facturation" element={<Facturation />} />
        <Route path="/apprenants" element={<Apprenants />} />
        <Route path="/apprenants/:id" element={<ApprenantDetail />} />
        <Route path="/formateurs" element={<Formateurs />} />
        <Route path="/entreprises" element={<Entreprises />} />
        <Route path="/financeurs" element={<Financeurs />} />
        <Route path="/lieux" element={<Lieux />} />
        <Route path="/parametres" element={<Parametres />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors closeButton />
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
