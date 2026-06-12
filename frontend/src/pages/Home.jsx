import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowRight, ShieldCheck, ChartLineUp, Kanban, FilePdf, Receipt, Users,
  CheckCircle, GoogleLogo, SignIn, Lightning, Clock, TrendUp, Shield, Sparkle,
} from "@phosphor-icons/react";

const FEATURES = [
  { icon: Kanban, title: "Pilotage Kanban", desc: "Visualisez toutes vos sessions en un coup d'œil — du brouillon à l'archivage. Glissez-déposez pour passer d'une étape à l'autre, sans tableur Excel." },
  { icon: Users, title: "Fichier apprenants intelligent", desc: "Centralisez vos stagiaires, détectez et fusionnez les doublons en un clic. Chaque fiche regroupe 11 catégories de documents pédagogiques et administratifs." },
  { icon: Receipt, title: "Facturation CPF automatisée", desc: "Importez votre export EDOF en 3 clics. Le CRM crée vos sessions, relie automatiquement vos stagiaires et suit vos encaissements en temps réel." },
  { icon: FilePdf, title: "Documents Qualiopi prêts à signer", desc: "Convention, contrat, convocation, attestation, émargement, facture, programme, évaluation — 8 modèles conformes au Code du travail, générés et classés automatiquement." },
  { icon: ChartLineUp, title: "Tableau de bord à 360°", desc: "Suivez votre chiffre d'affaires, votre marge, votre progression Qualiopi et votre calendrier de formations sur un seul écran." },
  { icon: ShieldCheck, title: "Sécurité & conformité", desc: "Hébergement en Europe, authentification renforcée, traçabilité complète. Conçu pour les audits Qualiopi et le contrôle Bilan Pédagogique et Financier (BPF)." },
];

const VALUE_PROPS = [
  { icon: Clock, title: "Gagnez 10h par semaine", desc: "Fini la saisie manuelle et les copier-coller : imports EDOF, génération de documents et classement automatique." },
  { icon: TrendUp, title: "Suivez votre activité en temps réel", desc: "Pilotage commercial, encaissements CPF, progression Qualiopi : tout ce qui compte, sur un seul tableau de bord." },
  { icon: Shield, title: "Restez conforme, sans stress", desc: "Qualiopi, BPF, RGPD, Code du travail : chaque session respecte vos obligations légales. Audits sereins garantis." },
];

const TARGETS = [
  "Organismes de formation Qualiopi",
  "Centres de bilan de compétences",
  "Organismes CPF",
  "Formateurs indépendants",
  "Centres VAE & apprentissage",
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#0B1726] text-white overflow-hidden">
      {/* Top navigation */}
      <nav className="relative z-20 border-b border-white/5 bg-[#0B1726]/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/blade-logo.png" alt="Blade Academy" className="w-9 h-9 rounded-full" />
            <div>
              <div className="font-display text-sm font-bold tracking-tight">
                BLADE<span className="text-brand-400">ACADEMY</span>
              </div>
              <div className="text-[9px] uppercase tracking-widest text-white/40">CRM Qualiopi</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://blade-academy.fr" target="_blank" rel="noreferrer" className="hidden sm:inline text-xs text-white/60 hover:text-white transition-colors" data-testid="home-link-vitrine">
              ← Site vitrine
            </a>
            {user ? (
              <Link
                to="/dashboard"
                data-testid="home-cta-dashboard"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold transition-colors"
              >
                Mon espace <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" data-testid="home-link-login" className="text-xs text-white/80 hover:text-white transition-colors">
                  Se connecter
                </Link>
                <Link
                  to="/register"
                  data-testid="home-cta-register"
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold transition-colors"
                >
                  Créer un compte <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 blade-hero opacity-90 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-16 pb-24 lg:pt-24 lg:pb-32">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 text-brand-300 text-[11px] font-semibold uppercase tracking-widest border border-brand-500/20">
                <ShieldCheck size={12} weight="fill" /> Qualiopi N° 338511-1 · NDA 32020170602
              </span>
              <h1 className="font-display mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight uppercase">
                Pilotez vos formations
                <br />
                <span className="text-brand-400">sans limites.</span>
              </h1>
              <p className="mt-6 text-base sm:text-lg text-white/70 max-w-xl leading-relaxed">
                La plateforme tout-en-un pensée pour les organismes de formation, centres de bilan
                et formateurs indépendants. Simplifiez votre quotidien, libérez du temps administratif
                et concentrez-vous sur ce qui compte vraiment : <span className="text-white">former.</span>
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  to={user ? "/dashboard" : "/login"}
                  data-testid="home-cta-primary"
                  className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold transition-all hover:scale-[1.02]"
                >
                  <SignIn size={16} weight="bold" />
                  {user ? "Accéder à mon espace" : "Accéder au CRM"}
                </Link>
                {!user && (
                  <Link
                    to="/register"
                    data-testid="home-cta-secondary"
                    className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold transition-colors"
                  >
                    Créer un compte
                  </Link>
                )}
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-white/50">
                <span className="inline-flex items-center gap-1.5"><CheckCircle size={14} weight="fill" className="text-brand-400" /> Conformité Qualiopi</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle size={14} weight="fill" className="text-brand-400" /> Données hébergées en Europe</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle size={14} weight="fill" className="text-brand-400" /> Export BPF automatique</span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] backdrop-blur-sm p-7 overflow-hidden">
                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-500/15 text-brand-300 text-[10px] font-semibold uppercase tracking-widest border border-brand-500/20">
                    <Sparkle size={11} weight="fill" /> Solution clé en main
                  </div>
                  <div className="font-display text-2xl font-bold mt-5 leading-tight">
                    Tout votre organisme,<br />
                    <span className="text-brand-400">en un seul outil.</span>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {VALUE_PROPS.map((vp) => (
                      <li key={vp.title} className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                          <vp.icon size={18} className="text-brand-400" weight="duotone" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">{vp.title}</div>
                          <div className="text-xs text-white/60 mt-0.5 leading-relaxed">{vp.desc}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative bg-[#08111E] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-20 lg:py-24">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-widest text-brand-400 font-semibold">Une plateforme, six super-pouvoirs</div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mt-2 leading-tight">
              Toute votre administration<br />pédagogique, automatisée.
            </h2>
            <p className="text-white/60 mt-4 max-w-xl">
              Du premier contact à l&apos;attestation finale, chaque étape est pensée pour vous faire gagner du temps
              tout en garantissant votre conformité.
            </p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-brand-500/30 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-4 group-hover:bg-brand-500/20 transition-colors">
                  <f.icon size={20} className="text-brand-400" weight="duotone" />
                </div>
                <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                <p className="text-sm text-white/60 mt-2 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pour qui */}
      <section className="border-t border-white/5 bg-[#0B1726]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-[11px] uppercase tracking-widest text-brand-400 font-semibold">Pour qui ?</div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mt-2 leading-tight">
              Conçu pour les professionnels de la formation.
            </h2>
            <p className="text-white/60 mt-4">
              Que vous gériez 10 stagiaires par an ou 1 000, notre CRM s&apos;adapte à votre rythme.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {TARGETS.map((t) => (
              <span key={t} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/80">
                <CheckCircle size={14} weight="fill" className="text-brand-400" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA bottom */}
      <section className="border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 py-20 text-center">
          <Lightning size={32} className="text-brand-400 mx-auto mb-4" weight="duotone" />
          <h2 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
            Rejoignez les organismes qui ont déjà <span className="text-brand-400">simplifié leur quotidien</span>.
          </h2>
          <p className="text-white/60 mt-4 max-w-xl mx-auto">
            Démarrez en quelques minutes. Pas de carte bancaire requise pour découvrir l&apos;outil —
            connectez-vous et explorez à votre rythme.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to={user ? "/dashboard" : "/login"}
              data-testid="home-cta-bottom"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-full bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold transition-all hover:scale-[1.02]"
            >
              <SignIn size={16} weight="bold" />
              {user ? "Accéder à mon espace" : "Démarrer maintenant"}
            </Link>
            {!user && (
              <button
                onClick={() => {
                  const redirectUrl = window.location.origin + "/dashboard";
                  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
                }}
                data-testid="home-cta-google"
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-white text-slate-900 hover:bg-white/90 text-sm font-semibold transition-colors"
              >
                <GoogleLogo size={16} weight="bold" /> Continuer avec Google
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#070D17]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 flex flex-col sm:flex-row justify-between gap-4 text-xs text-white/40">
          <div>© {new Date().getFullYear()} Blade Academy SAS · SIRET 984 617 654 00012 · Qualiopi N° 338511-1</div>
          <div className="flex gap-5">
            <a href="https://blade-academy.fr" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">blade-academy.fr</a>
            <a href="mailto:blade.academy@hotmail.com" className="hover:text-white transition-colors">Contact</a>
            <Link to="/login" className="hover:text-white transition-colors">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
