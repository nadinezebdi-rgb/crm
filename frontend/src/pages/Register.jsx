import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatApiError } from "@/lib/api";
import { ArrowRight } from "@phosphor-icons/react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register(form);
      toast.success("Compte créé");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Création impossible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[rgb(var(--bg))] p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8 animate-fade-in-up" data-testid="register-page">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/blade-logo.png" alt="Blade Academy" className="h-9 w-9 rounded-full" />
          <div className="font-display font-bold uppercase tracking-tight text-slate-900">
            Blade<span className="text-brand-600">Academy</span>
          </div>
        </div>

        <h1 className="font-display text-2xl font-semibold tracking-tight">Créer votre compte</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">Commencez à piloter vos sessions en quelques minutes.</p>

        <form onSubmit={onSubmit} className="space-y-3" data-testid="register-form">
          <div>
            <Label className="text-xs font-medium text-slate-700">Nom complet</Label>
            <Input data-testid="register-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700">Email professionnel</Label>
            <Input data-testid="register-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700">Mot de passe</Label>
            <Input data-testid="register-password" type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700">Rôle</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger data-testid="register-role" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrateur</SelectItem>
                <SelectItem value="formateur">Formateur</SelectItem>
                <SelectItem value="apprenant">Apprenant</SelectItem>
                <SelectItem value="entreprise">Entreprise cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" data-testid="register-submit" className="w-full mt-4 h-10 bg-brand-600 hover:bg-brand-700" disabled={submitting}>
            {submitting ? "Création…" : (<>Créer le compte <ArrowRight size={14} className="ml-1.5" /></>)}
          </Button>
        </form>

        <p className="mt-5 text-xs text-slate-500 text-center">
          Déjà inscrit ?{" "}
          <Link to="/login" data-testid="goto-login" className="text-brand-600 hover:text-brand-700 font-medium">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
