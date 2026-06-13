import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { STATUS_LABELS, STATUS_COLUMNS, DOC_TYPES, DOC_TYPE_LABEL, FINANCEURS } from "@/lib/constants";
import { formatDate, formatSize } from "@/lib/format";
import FinanceurBadge from "@/components/FinanceurBadge";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import {
  GraduationCap,
  Search,
  Trash2,
  X,
  Upload,
  FileText,
  Download,
  Loader2,
  Pencil,
  Save,
} from "lucide-react";

function StagiaireDetail({ stagiaire, formateurs, onClose, onUpdated, onDeleted }) {
  const [docs, setDocs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(stagiaire);
  const [uploading, setUploading] = useState(null);

  const refresh = async () => {
    const { data } = await api.get(`/stagiaires/${stagiaire.id}/documents`);
    setDocs(data);
  };

  useEffect(() => {
    setForm(stagiaire);
    refresh();
  }, [stagiaire]);

  const updateField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
        financeur: form.financeur,
        financeur_detail: form.financeur_detail,
        formation: form.formation,
        date_debut_formation: form.date_debut_formation || null,
        date_fin_formation: form.date_fin_formation || null,
        notes: form.notes,
      };
      Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);
      await api.put(`/stagiaires/${stagiaire.id}`, payload);
      toast.success("Dossier mis à jour");
      setEditing(false);
      onUpdated && onUpdated();
    } catch (e) {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const updateStatus = async (newStatus) => {
    try {
      await api.patch(`/stagiaires/${stagiaire.id}/status`, { status: newStatus });
      toast.success(`Statut: ${STATUS_LABELS[newStatus]}`);
      onUpdated && onUpdated();
      if (newStatus === "regle") {
        onClose();
      }
    } catch {
      toast.error("Erreur");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Supprimer définitivement ce dossier et ses documents ?")) return;
    try {
      await api.delete(`/stagiaires/${stagiaire.id}`);
      toast.success("Dossier supprimé");
      onDeleted && onDeleted();
    } catch {
      toast.error("Erreur de suppression");
    }
  };

  const upload = async (type, file) => {
    if (!file) return;
    setUploading(type);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("file", file);
      await api.post(`/stagiaires/${stagiaire.id}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${DOC_TYPE_LABEL[type]} ajouté(e)`);
      refresh();
    } catch (e) {
      toast.error("Erreur d'upload");
    } finally {
      setUploading(null);
    }
  };

  const removeDoc = async (id) => {
    try {
      await api.delete(`/documents/${id}`);
      toast.success("Document supprimé");
      refresh();
    } catch {
      toast.error("Erreur");
    }
  };

  const downloadDoc = (d) => {
    const url = `${api.defaults.baseURL}/documents/${d.id}/download`;
    window.open(url, "_blank");
  };

  const inputCls =
    "h-9 w-full text-sm border border-gray-300 rounded-md px-3 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none bg-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/30"
      onClick={onClose}
      data-testid="stagiaire-detail-overlay"
    >
      <div
        className="w-full max-w-2xl bg-white shadow-xl border-l border-gray-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="stagiaire-detail-panel"
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
          <div>
            <div className="text-base font-bold text-slate-900" style={{ fontFamily: "'Manrope', sans-serif" }}>
              {stagiaire.prenom} {stagiaire.nom}
            </div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400 mt-0.5">
              Dossier · {stagiaire.id.slice(0, 8)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <button
                onClick={save}
                data-testid="detail-save"
                className="h-8 px-3 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" /> Enregistrer
              </button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                data-testid="detail-edit"
                className="h-8 px-3 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" /> Éditer
              </button>
            )}
            <button
              onClick={handleDelete}
              data-testid="detail-delete"
              className="h-8 px-3 text-xs font-medium text-rose-600 border border-rose-200 rounded-md hover:bg-rose-50 inline-flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              data-testid="detail-close"
              className="h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Statut
              </h3>
              <FinanceurBadge value={stagiaire.financeur} />
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_COLUMNS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => updateStatus(c.id)}
                  data-testid={`detail-status-${c.id}`}
                  className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                    stagiaire.status === c.id
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {c.title}
                </button>
              ))}
              <button
                onClick={() => updateStatus("regle")}
                data-testid="detail-status-regle"
                className={`text-[11px] px-2.5 py-1 rounded border inline-flex items-center gap-1 transition-colors ${
                  stagiaire.status === "regle"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                Réglé (archive)
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">
              Informations
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {editing ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom</label>
                    <input className={inputCls} value={form.prenom || ""} onChange={(e) => updateField("prenom", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nom</label>
                    <input className={inputCls} value={form.nom || ""} onChange={(e) => updateField("nom", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                    <input className={inputCls} value={form.email || ""} onChange={(e) => updateField("email", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Téléphone</label>
                    <input className={inputCls} value={form.telephone || ""} onChange={(e) => updateField("telephone", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse</label>
                    <input className={inputCls} value={form.adresse || ""} onChange={(e) => updateField("adresse", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Formateur</label>
                    <select className={inputCls} value={form.formateur_id || ""} onChange={(e) => updateField("formateur_id", e.target.value)}>
                      <option value="">— Aucun —</option>
                      {formateurs.map((f) => (
                        <option key={f.id} value={f.id}>{f.prenom} {f.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Financeur</label>
                    <select className={inputCls} value={form.financeur} onChange={(e) => updateField("financeur", e.target.value)}>
                      {FINANCEURS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Détail financeur</label>
                    <input className={inputCls} value={form.financeur_detail || ""} onChange={(e) => updateField("financeur_detail", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Formation</label>
                    <input className={inputCls} value={form.formation || ""} onChange={(e) => updateField("formation", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Début formation</label>
                    <input type="date" className={inputCls} value={(form.date_debut_formation || "").slice(0, 10)} onChange={(e) => updateField("date_debut_formation", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fin formation</label>
                    <input type="date" className={inputCls} value={(form.date_fin_formation || "").slice(0, 10)} onChange={(e) => updateField("date_fin_formation", e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <Info label="Email" value={stagiaire.email} />
                  <Info label="Téléphone" value={stagiaire.telephone} />
                  <Info label="Adresse" value={stagiaire.adresse} colSpan />
                  <Info label="Date de naissance" value={formatDate(stagiaire.date_naissance)} />
                  <Info label="Formateur" value={stagiaire.formateur_nom} />
                  <Info label="Financeur détail" value={stagiaire.financeur_detail} />
                  <Info label="Formation" value={stagiaire.formation} />
                  <Info label="Date d'entrée" value={formatDate(stagiaire.date_entree)} />
                  <Info label="Début formation" value={formatDate(stagiaire.date_debut_formation)} />
                  <Info label="Fin formation" value={formatDate(stagiaire.date_fin_formation)} />
                  {stagiaire.status === "regle" ? (
                    <Info label="Clôturé le" value={formatDate(stagiaire.date_cloture)} colSpan />
                  ) : null}
                  {stagiaire.notes ? <Info label="Notes" value={stagiaire.notes} colSpan /> : null}
                </>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">
              Documents
            </h3>
            <div className="space-y-3">
              {DOC_TYPES.map((t) => {
                const ofType = docs.filter((d) => d.type === t.id);
                return (
                  <div key={t.id} className="border border-gray-200 rounded-md p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-slate-900">{t.label}</div>
                      <label
                        className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-1 cursor-pointer inline-flex items-center gap-1"
                        data-testid={`upload-${t.id}`}
                      >
                        {uploading === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        Importer
                        <input
                          type="file"
                          hidden
                          onChange={(e) => upload(t.id, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                    {ofType.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {ofType.map((d) => (
                          <li
                            key={d.id}
                            data-testid={`doc-row-${d.id}`}
                            className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded px-2 py-1.5"
                          >
                            <div className="inline-flex items-center gap-2 truncate">
                              <FileText className="h-3.5 w-3.5 text-slate-500" />
                              <span className="truncate text-slate-700">{d.original_filename}</span>
                              <span className="text-slate-400">· {formatSize(d.size)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => downloadDoc(d)}
                                className="h-6 w-6 inline-flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded"
                                data-testid={`download-doc-${d.id}`}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => removeDoc(d.id)}
                                className="h-6 w-6 inline-flex items-center justify-center text-rose-500 hover:bg-rose-100 rounded"
                                data-testid={`delete-doc-${d.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
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
    </div>
  );
}

function Info({ label, value, colSpan }) {
  return (
    <div className={colSpan ? "col-span-2" : ""}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 mt-0.5">{value || "—"}</div>
    </div>
  );
}

export default function ActionsFormation() {
  const [stagiaires, setStagiaires] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: items }, { data: f }] = await Promise.all([
        api.get("/stagiaires/active"),
        api.get("/formateurs"),
      ]);
      setStagiaires(items);
      setFormateurs(f);
      if (selected) {
        const fresh = items.find((s) => s.id === selected.id);
        setSelected(fresh || null);
      }
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return stagiaires.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.nom?.toLowerCase().includes(q) ||
        s.prenom?.toLowerCase().includes(q) ||
        s.formation?.toLowerCase().includes(q) ||
        s.formateur_nom?.toLowerCase().includes(q) ||
        s.financeur_detail?.toLowerCase().includes(q)
      );
    });
  }, [stagiaires, filter, statusFilter]);

  return (
    <>
      <PageHeader
        title="Actions de Formation"
        subtitle="Fiches individuelles des programmes en cours"
        testid="actions-header"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                data-testid="actions-search"
                placeholder="Rechercher…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-9 pl-8 pr-3 text-sm border border-gray-300 rounded-md w-64 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none"
              />
            </div>
            <select
              data-testid="actions-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-300 rounded-md bg-white"
            >
              <option value="all">Tous statuts actifs</option>
              {STATUS_COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center text-slate-400 py-20">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-16 text-sm">
            <GraduationCap className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            Aucun dossier en cours
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <button
                key={s.id}
                data-testid={`action-card-${s.id}`}
                onClick={() => setSelected(s)}
                className="text-left bg-white border border-gray-200 rounded-md p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="leading-tight">
                    <div className="text-sm font-semibold text-slate-900" style={{ fontFamily: "'Manrope', sans-serif" }}>
                      {s.prenom} {s.nom}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{s.formation || "—"}</div>
                  </div>
                  <FinanceurBadge value={s.financeur} />
                </div>
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  <div>Formateur · {s.formateur_nom || "non assigné"}</div>
                  <div>Entrée · {formatDate(s.date_entree)}</div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] font-semibold text-slate-700">
                  {STATUS_LABELS[s.status]}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected ? (
        <StagiaireDetail
          stagiaire={selected}
          formateurs={formateurs}
          onClose={() => setSelected(null)}
          onUpdated={load}
          onDeleted={() => {
            setSelected(null);
            load();
          }}
        />
      ) : null}
    </>
  );
}
