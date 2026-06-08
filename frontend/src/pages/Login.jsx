import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatApiError } from "@/lib/api";
import { ChartBar, GoogleLogo, ShieldCheck, ArrowRight } from "@phosphor-icons/react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("admin@formapro.fr");
  const [password, setPassword] = useState("admin123");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success("Connexion réussie");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Connexion impossible");
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const hasError = new URLSearchParams(location.search).get("error");

  return (
    <div className="min-h-screen grid lg:grid-cols-5 brand-grad" data-testid="login-page">
      {/* Left visual */}
      <div className="hidden lg:flex lg:col-span-3 flex-col justify-between p-12 relative overflow-hidden dotted-bg">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-lg bg-[rgb(var(--brand))] flex items-center justify-center text-white">
            <ChartBar size={22} weight="duotone" />
          </div>
          <div>
            <div className="font-display font-semibold text-slate-900 text-lg">FormaPro</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Édition Pro</div>
          </div>
        </div>

        <div className="max-w-xl">
          <div className="text-xs font-semibold uppercase tracking-widest text-blue-700 mb-3">Plateforme conforme Qualiopi</div>
          <h1 className="font-display text-4xl lg:text-5xl font-semibold text-slate-900 tracking-tight leading-[1.05]">
            Pilotez tout votre organisme<br />de formation.<span className="text-blue-600">.</span>
          </h1>
          <p className="mt-5 text-slate-600 leading-relaxed max-w-md">
            Du tunnel commercial à la délivrance des attestations Qualiopi : sessions, apprenants, contrats et BPF, dans
            un seul outil clair et professionnel.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 max-w-md">
            {[
              { k: "Sessions", v: "Kanban temps réel" },
              { k: "Qualiopi", v: "Checklist auto" },
              { k: "BPF", v: "Inclusion/Exclusion" },
              { k: "Portails", v: "Apprenants & entreprises" },
            ].map((it) => (
              <div key={it.k} className="rounded-md border border-slate-200 bg-white/70 backdrop-blur p-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{it.k}</div>
                <div className="text-sm text-slate-900 font-medium mt-0.5">{it.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <ShieldCheck size={14} /> Données hébergées en Europe • Conformité Qualiopi & BPF
        </div>
      </div>

      {/* Right form */}
      <div className="lg:col-span-2 flex items-center justify-center p-6 sm:p-12 bg-white border-l border-slate-200">
        <form onSubmit={onSubmit} className="w-full max-w-sm animate-fade-in-up" data-testid="login-form">
          <div className="mb-7">
            <div className="text-xs font-semibold uppercase tracking-widest text-blue-700 mb-2">Bienvenue</div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Connectez-vous à FormaPro</h2>
            <p className="text-sm text-slate-500 mt-1">Accédez à vos sessions et votre référentiel.</p>
          </div>

          {hasError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Échec de la connexion Google. Réessayez.
            </div>
          )}

          <button
            type="button"
            onClick={onGoogle}
            data-testid="google-login-btn"
            className="w-full h-10 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-800 flex items-center justify-center gap-2 transition-colors"
          >
            <GoogleLogo size={18} weight="bold" /> Continuer avec Google
          </button>

          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-400">
            <div className="flex-1 h-px bg-slate-200" />
            ou avec votre email
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="email" className="text-xs font-medium text-slate-700">Email</Label>
              <Input
                id="email"
                data-testid="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@organisme.fr"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs font-medium text-slate-700">Mot de passe</Label>
              <Input
                id="password"
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="mt-1"
              />
            </div>
          </div>

          <Button type="submit" data-testid="login-submit" className="w-full mt-5 h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium" disabled={submitting}>
            {submitting ? "Connexion…" : (<>Se connecter <ArrowRight size={14} className="ml-1.5" /></>)}
          </Button>

          <p className="mt-5 text-xs text-slate-500 text-center">
            Pas encore de compte ?{" "}
            <Link to="/register" data-testid="goto-register" className="text-blue-600 hover:text-blue-700 font-medium">
              Créer un compte
            </Link>
          </p>

          <div className="mt-8 rounded-md bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600">
            <span className="font-semibold text-slate-700">Démo :</span> admin@formapro.fr / admin123
          </div>
        </form>
      </div>
    </div>
  );
}
