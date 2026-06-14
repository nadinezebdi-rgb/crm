import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Question, Upload, DownloadSimple, ArrowFatRight, X, CheckCircle, Lightning } from "@phosphor-icons/react";

const STEPS_UPLOAD = [
  {
    icon: "👤",
    title: "Ouvrez la fiche du stagiaire",
    desc: "Cliquez sur la ligne du stagiaire dans le tableau ci-dessous → un panneau s'ouvre sur la droite.",
  },
  {
    icon: "📂",
    title: "Allez à la section « Documents »",
    desc: "Faites défiler le panneau. Vous voyez 4 cartes : Devis signé, Attestation, Facture, Justificatif de paiement.",
  },
  {
    icon: "⬆️",
    title: "Cliquez sur « Importer »",
    desc: "À droite du type de document, le petit bouton « Importer » ouvre le sélecteur de fichier.",
  },
  {
    icon: "📎",
    title: "Choisissez votre fichier",
    desc: "PDF, Excel (.xlsx), Word, image, CSV — tous les formats courants acceptés. Max 15 Mo.",
  },
  {
    icon: "✅",
    title: "C'est terminé !",
    desc: "Le fichier s'affiche immédiatement sous le type, avec sa taille et 2 icônes : télécharger / supprimer.",
  },
];

const STEPS_DOWNLOAD = [
  { icon: "👆", title: "Ouvrez la fiche du stagiaire", desc: "Cliquez sur la ligne du stagiaire." },
  { icon: "👁️", title: "Repérez le fichier", desc: "Sous chaque type de document, vous voyez les fichiers déjà importés." },
  { icon: "⬇️", title: "Cliquez sur l'icône de téléchargement", desc: "L'icône avec une flèche descendante à droite du nom du fichier." },
  { icon: "💾", title: "Le fichier s'enregistre", desc: "Le téléchargement démarre avec le nom d'origine du fichier." },
];

export default function DocumentDemoBanner() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState("upload");
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("apprenants_doc_demo_dismissed") === "1"; } catch { return false; }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem("apprenants_doc_demo_dismissed", "1"); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <div data-testid="document-demo-banner" className="bg-gradient-to-br from-blue-50 via-white to-emerald-50 border border-blue-200 rounded-lg shadow-sm mb-5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/40 transition-colors"
      >
        <div className="h-9 w-9 rounded-md bg-navy text-white flex items-center justify-center flex-shrink-0">
          <Question size={18} weight="duotone" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
            Comment importer et télécharger un document ?
            <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-700 bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5">
              Démo
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {open ? "Cliquez pour replier ce guide" : "Cliquez pour afficher le pas-à-pas"}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          data-testid="dismiss-doc-demo"
          className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded hover:bg-white/60"
          title="Masquer définitivement"
        >
          <X size={14} />
        </button>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-blue-100">
          {/* Tabs */}
          <div className="inline-flex gap-1 p-1 bg-white border border-slate-200 rounded-md mb-4 mt-3">
            <button
              onClick={() => setTab("upload")}
              data-testid="demo-tab-upload"
              className={`px-3 py-1.5 text-xs font-semibold rounded inline-flex items-center gap-1.5 transition-colors ${
                tab === "upload" ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Upload size={12} weight="bold" /> Importer un document
            </button>
            <button
              onClick={() => setTab("download")}
              data-testid="demo-tab-download"
              className={`px-3 py-1.5 text-xs font-semibold rounded inline-flex items-center gap-1.5 transition-colors ${
                tab === "download" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <DownloadSimple size={12} weight="bold" /> Télécharger un document
            </button>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {(tab === "upload" ? STEPS_UPLOAD : STEPS_DOWNLOAD).map((s, i) => (
              <div
                key={i}
                data-testid={`demo-step-${tab}-${i}`}
                className="bg-white border border-slate-200 rounded-md p-3 relative"
              >
                <div className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-navy text-white text-[11px] font-bold flex items-center justify-center shadow">
                  {i + 1}
                </div>
                <div className="text-2xl mb-1.5">{s.icon}</div>
                <div className="text-xs font-semibold text-slate-900 mb-1 leading-tight">{s.title}</div>
                <div className="text-[11px] text-slate-600 leading-snug">{s.desc}</div>
              </div>
            ))}
          </div>

          {/* Footer tip */}
          <div className="mt-4 flex items-start gap-2 p-3 bg-white/60 border border-blue-200 rounded-md text-xs text-slate-700">
            <Lightning size={14} weight="fill" className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Astuce IA :</strong> sur la fiche d'un stagiaire, le bouton <strong>« Charger PDF »</strong> (violet, en haut)
              lit automatiquement un dossier PDF (EDOF, fiche de renseignement…) et remplit les coordonnées du stagiaire +
              sélectionne le niveau Anglais (A1 → C2) sans saisie manuelle.{" "}
              <Link to="/guide#pdf-ia" className="text-navy underline font-semibold">Voir le guide complet →</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
