import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { STATUS_COLUMNS, STATUS_LABELS, DOC_TYPES, FINANCEUR_TYPES, NIVEAUX_ANGLAIS, formatDate, formatSize } from "@/lib/dossiers";
import FinanceurBadge from "@/components/FinanceurBadge";
import DocumentPreviewDialog from "@/components/DocumentPreviewDialog";
import { toast } from "sonner";
import { X, PencilSimple, Trash, FloppyDisk, Upload, FileText, Download, Spinner, FilePdf, Sparkle, Archive, CheckCircle, Eye } from "@phosphor-icons/react";

function Info({ label, value, colSpan }) {
  return (
    <div className={colSpan ? "col-span-2" : ""}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 mt-0.5">{value || "—"}</div>
    </div>
  );
}

export default function DossierDrawer({ dossier, mode = "edit", onClose, onUpdated, onDeleted }) {
  const [docs, setDocs] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(dossier);
  const [uploading, setUploading] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const readonly = mode === "readonly";

  const refreshDocs = async () => {
    try {
      const [docsRes, facturesRes] = await Promise.all([
        api.get(`/dossiers/${dossier.id}/documents`),
        api.get(`/dossiers/${dossier.id}/factures-cpf`).catch(() => ({ data: [] })),
      ]);
      const baseDocs = docsRes.data || [];
      // Injecte les factures CPF importées (métadonnées EDOF) comme pseudo-documents
      // de type "facture" — sans fichier téléchargeable — pour valider le 4/4.
      const cpfPseudoDocs = (facturesRes.data || []).map((f) => ({
        id: `cpf-${f.id}`,
        type: "facture",
        original_filename:
          (f.numero_facture ? `Facture ${f.numero_facture}` : `Facture CPF`) +
          (f.montant ? ` · ${Number(f.montant).toFixed(2)} €` : ""),
        size: 0,
        is_cpf_import: true,
        statut_reglement: f.statut_reglement,
      }));
      setDocs([...baseDocs, ...cpfPseudoDocs]);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setForm(dossier);
    refreshDocs();
    if (!readonly) {
      api.get("/formateurs").then(({ data }) => setFormateurs(data)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier?.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    try {
      const payload = {
        nom: form.nom,
        prenom: form.prenom,
        date_naissance: form.date_naissance || null,
        adresse: form.adresse,
        email: form.email,
        telephone: form.telephone,
        formateur_id: form.formateur_id || null,
        financeur_type: form.financeur_type,
        financeur_nom: form.financeur_nom,
        formation: form.formation,
        date_debut_formation: form.date_debut_formation || null,
        date_fin_formation: form.date_fin_formation || null,
        notes: form.notes,
      };
      Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);
      await api.put(`/dossiers/${dossier.id}`, payload);
      toast.success("Dossier mis à jour");
      setEditing(false);
      onUpdated && onUpdated();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    }
  };

  const updateStatus = async (newStatus) => {
    try {
      await api.patch(`/dossiers/${dossier.id}/status`, { status: newStatus });
      toast.success(`Statut : ${STATUS_LABELS[newStatus]}`);
      onUpdated && onUpdated();
      if (newStatus === "regle") onClose && onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    }
  };

  const remove = async () => {
    if (!window.confirm("Supprimer définitivement ce dossier et ses documents ?")) return;
    try {
      await api.delete(`/dossiers/${dossier.id}`);
      toast.success("Dossier supprimé");
      onDeleted && onDeleted();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    }
  };

  const upload = async (type, file) => {
    if (!file) return;
    setUploading(type);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("file", file);
      await api.post(`/dossiers/${dossier.id}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document ajouté");
      refreshDocs();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur d'upload");
    } finally {
      setUploading(null);
    }
  };

  const removeDoc = async (d) => {
    try {
      if (d.source === "library") {
        // Library doc cross-linké : on ne supprime pas le fichier, on retire juste la méta de cross-link
        if (!window.confirm("Retirer ce document du dossier ? Le fichier reste dans la bibliothèque centrale.")) return;
        await api.patch(`/library/${d.id}/detach-apprenant`).catch(() => {});
        toast.success("Document retiré du dossier");
      } else {
        await api.delete(`/dossier-documents/${d.id}`);
        toast.success("Document supprimé");
      }
      refreshDocs();
    } catch {
      toast.error("Erreur");
    }
  };

  const downloadDoc = async (d) => {
    try {
      const path = d.source === "library"
        ? `/library/${d.id}/download`
        : `/dossier-documents/${d.id}/download`;
      const res = await fetch(`${api.defaults.baseURL}${path}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = d.original_filename || "document";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      toast.error("Impossible de télécharger le fichier");
    }
  };

  const downloadDossierPdf = async () => {
    try {
      const res = await fetch(`${api.defaults.baseURL}/dossiers/${dossier.id}/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `dossier_${dossier.nom}_${dossier.prenom}.pdf`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
      toast.success("PDF du dossier téléchargé");
    } catch (e) {
      toast.error("Erreur lors de la génération du PDF");
    }
  };

  const extractFromPdf = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Format PDF requis");
      return;
    }
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/dossiers/${dossier.id}/extract-and-fill`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const applied = data.applied_updates || {};
      const fields = Object.keys(applied).filter((k) => k !== "updated_at");
      if (fields.length === 0) {
        toast.info("Aucun nouveau champ détecté (le dossier était déjà complet)");
      } else {
        toast.success(
          `Champs mis à jour : ${fields.join(", ")}${data.llm_used ? " · via IA" : " · via regex"}`
        );
      }
      onUpdated && onUpdated();
      // Met à jour le form local
      if (data.dossier) setForm(data.dossier);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur d'extraction PDF");
    } finally {
      setExtracting(false);
    }
  };

  const inputCls =
    "h-9 w-full text-sm border border-slate-300 rounded-md px-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/30"
      onClick={onClose}
      data-testid="dossier-drawer-overlay"
    >
      <div
        className="w-full max-w-2xl bg-white shadow-xl border-l border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="dossier-drawer"
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200">
          <div>
            <div className="text-base font-bold text-slate-900 font-display">
              {dossier.prenom} {dossier.nom}
            </div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400 mt-0.5">
              {readonly ? `Archivé · ${formatDate(dossier.date_cloture)}` : `Dossier · ${dossier.id.slice(0, 8)}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!readonly && (
              <>
                <label
                  data-testid="drawer-extract-pdf"
                  title="Charger un dossier PDF — extraction IA des coordonnées"
                  className="h-8 px-3 text-xs font-medium text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {extracting ? <Spinner size={13} className="animate-spin" /> : <Sparkle size={13} weight="bold" />}
                  Charger PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    disabled={extracting}
                    onChange={(e) => extractFromPdf(e.target.files?.[0])}
                  />
                </label>
              </>
            )}
            <button
              onClick={downloadDossierPdf}
              data-testid="drawer-download-pdf"
              title="Télécharger le dossier en PDF"
              className="h-8 px-3 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <FilePdf size={13} weight="bold" /> PDF
            </button>
            {!readonly && (
              <>
                {editing ? (
                  <button onClick={save} data-testid="drawer-save"
                    className="h-8 px-3 text-xs font-semibold text-white bg-navy rounded-md hover:bg-navy/90 inline-flex items-center gap-1.5">
                    <FloppyDisk size={13} weight="bold" /> Enregistrer
                  </button>
                ) : (
                  <button onClick={() => setEditing(true)} data-testid="drawer-edit"
                    className="h-8 px-3 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5">
                    <PencilSimple size={13} /> Éditer
                  </button>
                )}
                <button onClick={remove} data-testid="drawer-delete"
                  className="h-8 px-3 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 inline-flex items-center gap-1.5">
                  <Trash size={13} />
                </button>
              </>
            )}
            <button onClick={onClose} data-testid="drawer-close"
              className="h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-900">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!readonly && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Statut</h3>
                <FinanceurBadge value={dossier.financeur_type} />
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_COLUMNS.map((c) => (
                  <button key={c.id} onClick={() => updateStatus(c.id)} data-testid={`drawer-status-${c.id}`}
                    className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                      dossier.status === c.id
                        ? "bg-navy text-white border-navy"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}>
                    {c.title}
                  </button>
                ))}
                <button onClick={() => updateStatus("regle")} data-testid="drawer-status-regle"
                  className={`text-[11px] px-2.5 py-1 rounded border inline-flex items-center gap-1 transition-colors ${
                    dossier.status === "regle"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                  }`}>
                  Réglé (archive)
                </button>
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">Informations</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {editing ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom</label>
                    <input className={inputCls} value={form.prenom || ""} onChange={(e) => set("prenom", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nom</label>
                    <input className={inputCls} value={form.nom || ""} onChange={(e) => set("nom", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                    <input className={inputCls} value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Téléphone</label>
                    <input className={inputCls} value={form.telephone || ""} onChange={(e) => set("telephone", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse</label>
                    <input className={inputCls} value={form.adresse || ""} onChange={(e) => set("adresse", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Formateur</label>
                    <select className={inputCls} value={form.formateur_id || ""} onChange={(e) => set("formateur_id", e.target.value)}>
                      <option value="">— Aucun —</option>
                      {formateurs.map((f) => (
                        <option key={f.id} value={f.id}>{f.prenom} {f.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Financeur</label>
                    <select className={inputCls} value={form.financeur_type || "OPCO"} onChange={(e) => set("financeur_type", e.target.value)}>
                      {FINANCEUR_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Détail financeur</label>
                    <input className={inputCls} value={form.financeur_nom || ""} onChange={(e) => set("financeur_nom", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Formation</label>
                    <input
                      className={inputCls}
                      list="formation-niveaux"
                      value={form.formation || ""}
                      onChange={(e) => set("formation", e.target.value)}
                      placeholder="Ex: Anglais B1"
                    />
                    <datalist id="formation-niveaux">
                      {NIVEAUX_ANGLAIS.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Début formation</label>
                    <input type="date" className={inputCls} value={(form.date_debut_formation || "").slice(0, 10)} onChange={(e) => set("date_debut_formation", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fin formation</label>
                    <input type="date" className={inputCls} value={(form.date_fin_formation || "").slice(0, 10)} onChange={(e) => set("date_fin_formation", e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <Info label="Email" value={dossier.email} />
                  <Info label="Téléphone" value={dossier.telephone} />
                  <Info label="Adresse" value={dossier.adresse} colSpan />
                  <Info label="Date de naissance" value={formatDate(dossier.date_naissance)} />
                  <Info label="Formateur" value={dossier.formateur_nom} />
                  <Info label="Financeur" value={<FinanceurBadge value={dossier.financeur_type} />} />
                  <Info label="Détail financeur" value={dossier.financeur_nom} />
                  <Info label="Formation" value={dossier.formation} />
                  <Info label="Date d'entrée" value={formatDate(dossier.date_entree)} />
                  <Info label="Début formation" value={formatDate(dossier.date_debut_formation)} />
                  <Info label="Fin formation" value={formatDate(dossier.date_fin_formation)} />
                  {dossier.status === "regle" ? <Info label="Clôturé le" value={formatDate(dossier.date_cloture)} colSpan /> : null}
                  {dossier.notes ? <Info label="Notes" value={dossier.notes} colSpan /> : null}
                </>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Documents</h3>
              {(() => {
                const filledCount = DOC_TYPES.filter((t) => docs.some((d) => d.type === t.id)).length;
                const allFilled = filledCount === DOC_TYPES.length;
                return (
                  <span data-testid="docs-progress" className={`text-[11px] font-semibold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                    allFilled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>
                    {allFilled && <CheckCircle size={11} weight="fill" />}
                    {filledCount}/{DOC_TYPES.length} documents
                  </span>
                );
              })()}
            </div>

            {(() => {
              const filledCount = DOC_TYPES.filter((t) => docs.some((d) => d.type === t.id)).length;
              const allFilled = filledCount === DOC_TYPES.length;
              if (readonly || dossier.status === "regle") return null;
              return (
                <div
                  data-testid="send-to-archives-card"
                  className={`mb-4 rounded-lg p-4 border ${
                    allFilled
                      ? "bg-gradient-to-br from-emerald-50 to-white border-emerald-300"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-md flex items-center justify-center flex-shrink-0 ${
                      allFilled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-400"
                    }`}>
                      <Archive size={18} weight={allFilled ? "fill" : "duotone"} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-bold ${allFilled ? "text-emerald-900" : "text-slate-700"} font-display`}>
                        {allFilled ? "Tous les documents sont présents" : `${DOC_TYPES.length - filledCount} document(s) manquant(s)`}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {allFilled
                          ? "Vous pouvez maintenant clôturer ce dossier — il sera archivé dans « Dossiers Clôturés »."
                          : "Importez tous les documents (devis signé, attestation, facture, justificatif) pour pouvoir clôturer."}
                      </div>
                    </div>
                    <button
                      onClick={() => updateStatus("regle")}
                      disabled={!allFilled}
                      data-testid="send-to-archives-btn"
                      className={`h-9 px-4 text-sm font-semibold rounded-md inline-flex items-center gap-2 transition-all flex-shrink-0 ${
                        allFilled
                          ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md hover:shadow-lg"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      <Archive size={14} weight="bold" />
                      Envoyer vers Dossiers Clôturés
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-3">
              {DOC_TYPES.map((t) => {
                const ofType = docs.filter((d) => d.type === t.id);
                return (
                  <div key={t.id} className="border border-slate-200 rounded-md p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-slate-900 inline-flex items-center gap-2">
                        {ofType.length > 0 && <CheckCircle size={13} weight="fill" className="text-emerald-500" />}
                        {t.label}
                      </div>
                      {!readonly && (
                        <label data-testid={`upload-${t.id}`}
                          className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-1 cursor-pointer inline-flex items-center gap-1">
                          {uploading === t.id ? <Spinner size={11} className="animate-spin" /> : <Upload size={11} />}
                          Importer
                          <input
                            type="file"
                            hidden
                            accept=".pdf,.xlsx,.xls,.xlsm,.csv,.doc,.docx,.png,.jpg,.jpeg,.heic,.webp"
                            onChange={(e) => upload(t.id, e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </div>
                    {ofType.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {ofType.map((d) => (
                          <li key={d.id} data-testid={`doc-row-${d.id}`}
                            className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded px-2 py-1.5">
                            <span className="inline-flex items-center gap-2 truncate text-slate-700">
                              <FileText size={13} />
                              {d.is_cpf_import ? (
                                <span className="truncate">{d.original_filename}</span>
                              ) : (
                                <button
                                  onClick={() => setPreviewDoc(d)}
                                  data-testid={`open-doc-${d.id}`}
                                  title="Voir le fichier"
                                  className="truncate text-left hover:text-navy hover:underline cursor-pointer"
                                >
                                  {d.original_filename}
                                </button>
                              )}
                              {d.is_cpf_import ? (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                  Importée EDOF{d.statut_reglement ? ` · ${d.statut_reglement}` : ""}
                                </span>
                              ) : d.source === "library" ? (
                                <>
                                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                                    Bibliothèque{d.auto_attached ? " · Auto" : ""}
                                  </span>
                                  <span className="text-slate-400">· {formatSize(d.size)}</span>
                                </>
                              ) : (
                                <span className="text-slate-400">· {formatSize(d.size)}</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              {!d.is_cpf_import && (
                                <button onClick={() => setPreviewDoc(d)} data-testid={`preview-doc-${d.id}`}
                                  title="Voir le fichier"
                                  className="h-6 w-6 inline-flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded">
                                  <Eye size={13} />
                                </button>
                              )}
                              {!d.is_cpf_import && (
                                <button onClick={() => downloadDoc(d)} data-testid={`download-doc-${d.id}`}
                                  title="Télécharger"
                                  className="h-6 w-6 inline-flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded">
                                  <Download size={13} />
                                </button>
                              )}
                              {!readonly && !d.is_cpf_import && (
                                <button onClick={() => removeDoc(d)} data-testid={`delete-doc-${d.id}`}
                                  title="Supprimer / Détacher"
                                  className="h-6 w-6 inline-flex items-center justify-center text-red-500 hover:bg-red-100 rounded">
                                  <Trash size={13} />
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[11px] text-slate-400 mt-2">Aucun fichier</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      <DocumentPreviewDialog open={!!previewDoc} document={previewDoc} onClose={() => setPreviewDoc(null)} onAttached={refreshDocs} />
    </div>
  );
}
