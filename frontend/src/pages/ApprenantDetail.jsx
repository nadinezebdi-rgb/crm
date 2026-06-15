import React, { useEffect, useRef, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  UploadSimple,
  DownloadSimple,
  Trash,
  FileText,
  EnvelopeSimple,
  Phone,
  IdentificationCard,
  Kanban,
} from "@phosphor-icons/react";

export const CATEGORIES_DOCUMENTS = [
  { key: "certificat", label: "Certificat (ExAssess…)" },
  { key: "convocation_certification", label: "Convocation à la certification" },
  { key: "facture", label: "Facture" },
  { key: "attestation_assiduite", label: "Attestation d'assiduité" },
  { key: "releve_connexion", label: "Relevé de connexion" },
  { key: "contrat", label: "Contrat" },
  { key: "emargement", label: "Feuille d'émargement présentiel" },
  { key: "dpc", label: "DPC" },
  { key: "convention", label: "Convention" },
  { key: "communications", label: "Suivi des communications" },
  { key: "autre", label: "Autres documents" },
];

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");
const fmtSize = (o) => (o > 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

export default function ApprenantDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [apprenant, setApprenant] = useState(null);
  const [docs, setDocs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [uploadingCat, setUploadingCat] = useState(null);
  const [highlightCat, setHighlightCat] = useState(null);
  const fileRefs = useRef({});
  const catRefs = useRef({});

  const load = async () => {
    try {
      const [a, d, s] = await Promise.all([
        api.get(`/apprenants/${id}`),
        api.get(`/apprenants/${id}/documents`),
        api.get("/sessions"),
      ]);
      setApprenant(a.data);
      setDocs(d.data);
      setSessions(s.data.filter((x) => (x.apprenants || []).includes(id)));
    } catch {
      toast.error("Apprenant introuvable");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // Quand l'URL contient #facture (ou autre catégorie) on scrolle et on met en surbrillance
  useEffect(() => {
    if (!apprenant) return;
    const hash = (location.hash || "").replace(/^#/, "");
    if (!hash) return;
    const validKey = CATEGORIES_DOCUMENTS.find((c) => c.key === hash);
    if (!validKey) return;
    const el = catRefs.current[hash];
    if (!el) return;
    const scrollTimer = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightCat(hash);
    }, 100);
    const clearTimer = setTimeout(() => setHighlightCat(null), 2300);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [apprenant, location.hash]);

  const upload = async (cat, file) => {
    if (!file) return;
    setUploadingCat(cat);
    try {
      const fd = new FormData();
      fd.append("categorie", cat);
      fd.append("file", file);
      await api.post(`/apprenants/${id}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document ajouté");
      const { data } = await api.get(`/apprenants/${id}/documents`);
      setDocs(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Envoi impossible");
    } finally {
      setUploadingCat(null);
      if (fileRefs.current[cat]) fileRefs.current[cat].value = "";
    }
  };

  const download = (doc) => {
    const path = doc.source === "library"
      ? `/api/library/${doc.id}/download`
      : `/api/documents-apprenants/${doc.id}/download`;
    window.open(`${process.env.REACT_APP_BACKEND_URL}${path}`, "_blank");
  };

  const removeDoc = async (doc) => {
    if (!window.confirm(`Supprimer « ${doc.nom_fichier} » ?`)) return;
    try {
      if (doc.source === "library") {
        // Détache du document de la bibliothèque (ne supprime pas le fichier)
        await api.patch(`/library/${doc.id}/detach-apprenant`);
        toast.success("Document détaché de l'apprenant");
      } else {
        await api.delete(`/documents-apprenants/${doc.id}`);
        toast.success("Document supprimé");
      }
      setDocs(docs.filter((d) => d.id !== doc.id));
    } catch {
      toast.error("Action impossible");
    }
  };

  if (!apprenant) return <div className="p-10 text-sm text-slate-500">Chargement…</div>;

  return (
    <div className="p-6 lg:p-8" data-testid="apprenant-detail-page">
      <Link to="/apprenants" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-700 mb-4 transition-colors" data-testid="back-to-apprenants">
        <ArrowLeft size={14} /> Retour aux apprenants
      </Link>

      {/* En-tête fiche */}
      <Card className="border-slate-200 p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-navy text-white font-display font-semibold text-lg flex items-center justify-center">
              {(apprenant.prenom?.[0] || "") + (apprenant.nom?.[0] || "")}
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900" data-testid="apprenant-nom">
                {apprenant.prenom} {apprenant.nom}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-600">
                {apprenant.email && <span className="inline-flex items-center gap-1"><EnvelopeSimple size={13} /> {apprenant.email}</span>}
                {apprenant.telephone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {apprenant.telephone}</span>}
                {apprenant.dossier_cpf && (
                  <Badge className="bg-brand-50 text-brand-700 border-brand-200 text-[10px]">
                    <IdentificationCard size={12} className="mr-1" /> Dossier CPF n° {apprenant.dossier_cpf}
                  </Badge>
                )}
                {apprenant.formation && <span className="inline-flex items-center gap-1"><Kanban size={13} /> {apprenant.formation}</span>}
                {apprenant.niveau && (
                  <Badge className="bg-brand-50 text-brand-700 border-brand-200 text-[10px]">Niveau {apprenant.niveau}</Badge>
                )}
                {(apprenant.date_debut || apprenant.date_fin) && (
                  <span className="inline-flex items-center gap-1">Du {fmtDate(apprenant.date_debut)} au {fmtDate(apprenant.date_fin)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Documents</div>
            <div className="text-2xl font-display font-semibold text-brand-700" data-testid="apprenant-nb-docs">{docs.length}</div>
          </div>
        </div>
        {sessions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2 flex items-center gap-1"><Kanban size={12} /> Sessions suivies</div>
            <div className="flex flex-wrap gap-2">
              {sessions.map((s) => (
                <Link key={s.id} to={`/sessions/${s.id}`} className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 hover:border-brand-300 hover:text-brand-700 transition-colors">
                  {s.nom}
                </Link>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Documents par catégorie */}
      <h2 className="font-display text-lg font-semibold text-slate-900 mb-3">Documents du stagiaire</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORIES_DOCUMENTS.map((cat) => {
          const files = docs.filter((d) => d.categorie === cat.key);
          const isHighlighted = highlightCat === cat.key;
          return (
            <Card
              key={cat.key}
              ref={(el) => { catRefs.current[cat.key] = el; }}
              className={`border-slate-200 p-4 transition-all duration-500 ${isHighlighted ? "ring-4 ring-brand-400 ring-offset-2 border-brand-300 shadow-lg" : ""}`}
              data-testid={`doc-cat-${cat.key}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-brand-600" />
                  <span className="text-sm font-semibold text-slate-800">{cat.label}</span>
                  {files.length > 0 && <Badge className="bg-brand-50 text-brand-700 border-brand-200 text-[10px] h-4 px-1.5">{files.length}</Badge>}
                </div>
                <button
                  onClick={() => fileRefs.current[cat.key]?.click()}
                  disabled={uploadingCat === cat.key}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800 border border-brand-200 hover:bg-brand-50 rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                  data-testid={`doc-upload-${cat.key}`}
                >
                  <UploadSimple size={13} /> {uploadingCat === cat.key ? "Envoi…" : "Ajouter"}
                </button>
                <input
                  ref={(el) => { fileRefs.current[cat.key] = el; }}
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.eml,.msg"
                  data-testid={`doc-input-${cat.key}`}
                  onChange={(e) => upload(cat.key, e.target.files?.[0])}
                />
              </div>
              {files.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Aucun document.</p>
              ) : (
                <ul className="space-y-1.5">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5" data-testid={`doc-file-${f.id}`}>
                      <span className="flex-1 truncate text-slate-700 font-medium">{f.nom_fichier}</span>
                      {f.source === "library" && (
                        <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[9px] h-4 px-1.5 shrink-0" title={f.auto_attached ? "Rattachée automatiquement depuis la bibliothèque" : "Issue de la bibliothèque centrale"}>
                          {f.auto_attached ? "Auto" : "Lib"}
                        </Badge>
                      )}
                      <span className="text-slate-400 shrink-0">{fmtSize(f.taille)} · {fmtDate(f.uploaded_at)}</span>
                      <button onClick={() => download(f)} className="h-6 w-6 rounded hover:bg-brand-50 text-brand-700 flex items-center justify-center shrink-0" data-testid={`doc-download-${f.id}`}>
                        <DownloadSimple size={13} />
                      </button>
                      <button onClick={() => removeDoc(f)} className="h-6 w-6 rounded hover:bg-red-50 text-red-600 flex items-center justify-center shrink-0" data-testid={`doc-delete-${f.id}`}>
                        <Trash size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
