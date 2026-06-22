import React from "react";
import { Link } from "react-router-dom";
import { GoogleLogo, ArrowLeft, ShieldCheck, GearSix } from "@phosphor-icons/react";

export default function ForgotPassword() {
  const onGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/parametres";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-brand-50" data-testid="forgot-password-page">
      <div className="w-full max-w-md bg-white rounded-lg border border-slate-200 shadow-xl p-8 animate-fade-in-up">
        <Link to="/login" data-testid="back-to-login" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-5">
          <ArrowLeft size={12} /> Retour à la connexion
        </Link>

        <div className="text-xs font-semibold uppercase tracking-widest text-brand-700 mb-2">Mot de passe oublié</div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Réinitialisation en 3 étapes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Aucun email à envoyer : connectez-vous via Google puis choisissez un nouveau mot de passe directement dans vos paramètres.
        </p>

        <ol className="mt-6 space-y-3">
          <li className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <div>
              <div className="text-sm font-semibold text-slate-900">Connectez-vous via Google</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Bouton ci-dessous — utilisez l'adresse Google associée à votre compte CRM.</div>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <div>
              <div className="text-sm font-semibold text-slate-900">Allez dans <span className="inline-flex items-center gap-1 text-brand-700">Paramètres <GearSix size={12} /></span></div>
              <div className="text-[11px] text-slate-500 mt-0.5">Menu de gauche → tout en bas dans la section Config.</div>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <div>
              <div className="text-sm font-semibold text-slate-900">Section « Mon compte » → Changer le mot de passe</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Saisissez votre nouveau mot de passe (8 caractères min). Effet immédiat.</div>
            </div>
          </li>
        </ol>

        <button
          type="button"
          onClick={onGoogle}
          data-testid="forgot-google-btn"
          className="w-full mt-6 h-11 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2 transition-colors"
        >
          <GoogleLogo size={18} weight="bold" /> Se connecter avec Google
        </button>

        <div className="mt-5 flex items-center gap-2 text-[10px] text-slate-400">
          <ShieldCheck size={12} /> Vous n'utilisez pas Google ? Contactez votre administrateur.
        </div>
      </div>
    </div>
  );
}
