import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Folders,
  UploadSimple,
  MagnifyingGlass,
  FileText,
  FilePdf,
  FileXls,
  FileImage,
  FileDoc,
  DownloadSimple,
  Trash,
  Link as LinkIcon,
  LinkBreak,
  X,
  Spinner,
  Receipt,
  CheckCircle,
} from "@phosphor-icons/react";

const DOC_TYPES = [
  { id: "facture", label: "Facture" },
  { id: "devis_signe", label: "Devis signé" },
  { id: "attestation", label: "Attestation" },
  { id: "justificatif_paiement", label: "Justificatif paiement" },
  { id: "autre", label: "Autre" },
];

const TYPE_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.id, d.label]));
const TYPE_BADGE = {
  facture: "bg-blue-100 text-blue-700 border-blue-200",
  devis_signe: "bg-purple-100 text-purple-700 border-purple-200",
  attestation: "bg-emerald-100 text-emerald-700 border-emerald-200",
  justificatif_paiement: "bg-amber-100 text-amber-700 border-amber-200",
  autre: "bg-slate-100 text-slate-700 border-slate-200",
};

function fileIcon(filename = "", contentType = "") {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || contentType.includes("pdf")) return <FilePdf size={18} weight="duotone" className="text-red-500" />;
  if (["xlsx", "xls", "csv", "xlsm"].includes(ext)) return <FileXls size={18} weight="duotone" className="text-emerald-600" />;
  if (["doc", "docx"].includes(ext)) return <FileDoc size={18} weight="duotone" className="text-blue-600" />;
  if (["png", "jpg", "jpeg", "webp", "heic"].includes(ext)) return <FileImage size={18} weight="duotone" className="text-amber-500" />;
  return <FileText size={18} weight="duotone" className="text-slate-500" />;
}

function fmtSize(b) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(s) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function AttachDialog({ open, document, onClose, onAttached }) {
  const [dossiers, setDossiers] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/dossiers/active").then(({ data }) => setDossiers(data)).catch(() => {});
  }, [open]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return dossiers.slice(0, 50);
    return dossiers.filter(
      (d) => d.nom?.toLowerCase().includes(term) || d.prenom?.toLowerCase().includes(term) || d.formation?.toLowerCase().includes(term)
    ).slice(0, 50);
  }, [dossiers, q]);

  if (!open || !document) return null;

  const attach = async (dossier) => {
    setLoading(true);
    try {
      await api.patch(`/library/${document.id}/attach`, { dossier_id: dossier.id });
      toast.success(`Document rattaché à ${dossier.prenom} ${dossier.nom}`);
      onAttached && onAttached();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={onClose} data-testid="attach-dialog">
      <div className="bg-white w-full max-w-lg rounded-lg border border-slate-200 shadow-xl flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200">
          <div>
            <div className="text-sm font-bold text-slate-900 font-display">Rattacher à un stagiaire</div>
            <div className="text-[11px] text-slate-500 truncate max-w-[28rem]">{document.original_filename}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="attach-close"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              autoFocus
              placeholder="Rechercher un stagiaire (nom, prénom, formation)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="attach-search"
              className="h-9 pl-8 pr-3 w-full text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">Aucun dossier trouvé. <Link to="/onboarding" className="text-navy underline">Créer un stagiaire ?</Link></div>
          ) : (
            filtered.map((d) => (
              <button
                key={d.id}
                onClick={() => attach(d)}
                disabled={loading}
                data-testid={`attach-row-${d.id}`}
                className="w-full text-left p-2.5 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors flex items-center justify-between disabled:opacity-50"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">{d.prenom} {d.nom}</div>
                  <div className="text-[11px] text-slate-500">{d.formation || "—"} · {d.financeur_type}</div>
                </div>
                <LinkIcon size={14} className="text-navy" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState(null);
  const [scope, setScope] = useState("all"); // all | attached | unattached
  const [typeFilter, setTypeFilter] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState("facture");
  const [selected, setSelected] = useState(new Set());
  const [attachFor, setAttachFor] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("scope", scope);
      if (typeFilter) params.set("type", typeFilter);
      if (q) params.set("q", q);
      const [{ data: list }, { data: st }] = await Promise.all([
        api.get(`/library?${params.toString()}`),
        api.get("/library-stats"),
      ]);
      setDocs(list);
      setStats(st);
    } catch (e) {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope, typeFilter]);
  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q]);

  const onUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("type", uploadType);
        await api.post("/library/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success(`${files.length} document(s) importé(s)`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur d'import");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadDoc = async (d) => {
    try {
      const res = await api.get(`/library/${d.id}/download`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: d.content_type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.original_filename || "document";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Téléchargement impossible");
    }
  };

  const deleteOne = async (d) => {
    if (!window.confirm(`Supprimer le document « ${d.original_filename} » ?`)) return;
    try {
      await api.delete(`/library/${d.id}`);
      toast.success("Document supprimé");
      setSelected((p) => { const n = new Set(p); n.delete(d.id); return n; });
      load();
    } catch { toast.error("Erreur"); }
  };

  const detachOne = async (d) => {
    try {
      await api.patch(`/library/${d.id}/detach`);
      toast.success("Document détaché");
      load();
    } catch { toast.error("Erreur"); }
  };

  const updateType = async (d, newType) => {
    try {
      await api.patch(`/library/${d.id}`, { type: newType });
      load();
    } catch { toast.error("Erreur"); }
  };

  const toggleOne = (id) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const allSelected = docs.length > 0 && docs.every((d) => selected.has(d.id));
  const toggleAll = () => {
    setSelected((p) => {
      const n = new Set(p);
      if (allSelected) docs.forEach((d) => n.delete(d.id));
      else docs.forEach((d) => n.add(d.id));
      return n;
    });
  };

  const deleteBulk = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Supprimer ${selected.size} document(s) ?`)) return;
    try {
      const { data } = await api.delete("/library/bulk", { data: { ids: Array.from(selected) } });
      toast.success(`${data.deleted} document(s) supprimé(s)`);
      setSelected(new Set());
      load();
    } catch { toast.error("Erreur"); }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50" data-testid="documents-page">
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-navy text-white flex items-center justify-center">
              <Folders size={22} weight="duotone" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 font-display">Documents</h1>
              <p className="text-xs text-slate-500 mt-0.5">Bibliothèque centrale — factures, devis, attestations à rattacher aux stagiaires</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              data-testid="upload-type-select"
              className="h-9 px-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <label
              className="h-9 px-4 text-sm font-semibold text-white bg-navy hover:bg-navy/90 rounded-md inline-flex items-center gap-2 cursor-pointer"
              data-testid="upload-btn"
            >
              {uploading ? <Spinner size={14} className="animate-spin" /> : <UploadSimple size={14} weight="bold" />}
              Importer des fichiers
              <input
                ref={fileRef}
                type="file"
                hidden
                multiple
                accept=".pdf,.xlsx,.xls,.xlsm,.csv,.doc,.docx,.png,.jpg,.jpeg,.heic,.webp"
                onChange={(e) => onUpload(Array.from(e.target.files || []))}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-8 pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="library-stats">
            {[
              { label: "Total", value: stats.total, color: "text-slate-900" },
              { label: "Rattachés", value: stats.attached, color: "text-emerald-600" },
              { label: "Non rattachés", value: stats.unattached, color: "text-amber-600" },
              { label: "Factures", value: stats.by_type?.facture || 0, color: "text-blue-600" },
              { label: "Espace utilisé", value: fmtSize(stats.total_size_bytes), color: "text-purple-600", isText: true },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{s.label}</div>
                <div className={`text-xl font-bold ${s.color} font-display mt-1`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters + Search */}
      <div className="px-8 pt-5 pb-3">
        <div className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              placeholder="Rechercher par nom de fichier…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="lib-search"
              className="h-9 pl-8 pr-3 w-full text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <div className="inline-flex p-0.5 bg-slate-100 rounded-md">
            {[
              { id: "all", label: "Tous" },
              { id: "unattached", label: "Non rattachés" },
              { id: "attached", label: "Rattachés" },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                data-testid={`scope-${s.id}`}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  scope === s.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            data-testid="lib-type-filter"
            className="h-9 px-2 text-sm border border-slate-300 rounded-md bg-white"
          >
            <option value="">Tous types</option>
            {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="px-8 pb-3">
          <div data-testid="lib-bulk-bar" className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-md flex items-center justify-between">
            <div className="text-sm text-red-900">
              <strong>{selected.size}</strong> document{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
              <button onClick={() => setSelected(new Set())} className="ml-2 text-red-600 hover:text-red-800 text-xs">désélectionner</button>
            </div>
            <button onClick={deleteBulk} data-testid="lib-delete-bulk" className="h-8 px-3 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md inline-flex items-center gap-1.5">
              <Trash size={13} /> Supprimer la sélection
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="px-8 pb-8">
        <div
          className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden relative"
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-navy", "ring-offset-2"); }}
          onDragLeave={(e) => e.currentTarget.classList.remove("ring-2", "ring-navy", "ring-offset-2")}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("ring-2", "ring-navy", "ring-offset-2");
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) onUpload(files);
          }}
        >
          <table className="w-full text-sm" data-testid="lib-table">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2.5 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} data-testid="lib-select-all" className="h-4 w-4 rounded cursor-pointer" />
                </th>
                <th className="px-3 py-2.5 text-left font-semibold">Fichier</th>
                <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                <th className="px-3 py-2.5 text-left font-semibold">Stagiaire rattaché</th>
                <th className="px-3 py-2.5 text-left font-semibold">Taille</th>
                <th className="px-3 py-2.5 text-left font-semibold">Importé le</th>
                <th className="px-3 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400"><Spinner size={16} className="inline animate-spin mr-2" />Chargement…</td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  <Folders size={36} weight="duotone" className="mx-auto mb-2 text-slate-300" />
                  Aucun document
                  <div className="text-xs mt-1">Glissez-déposez des fichiers ici ou cliquez sur « Importer »</div>
                </td></tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id} data-testid={`lib-row-${d.id}`} className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors ${selected.has(d.id) ? "bg-red-50/30" : ""}`}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleOne(d.id)} data-testid={`lib-check-${d.id}`} className="h-4 w-4 rounded cursor-pointer" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {fileIcon(d.original_filename, d.content_type)}
                        <span className="font-medium text-slate-900 truncate max-w-[280px]" title={d.original_filename}>{d.original_filename}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={d.type}
                        onChange={(e) => updateType(d, e.target.value)}
                        data-testid={`lib-type-${d.id}`}
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border cursor-pointer ${TYPE_BADGE[d.type] || TYPE_BADGE.autre}`}
                      >
                        {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      {d.stagiaire ? (
                        <Link to="/actions" className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline" data-testid={`lib-stagiaire-${d.id}`}>
                          <CheckCircle size={13} weight="fill" /> {d.stagiaire.prenom} {d.stagiaire.nom}
                        </Link>
                      ) : (
                        <button onClick={() => setAttachFor(d)} data-testid={`lib-attach-${d.id}`} className="text-xs text-amber-700 hover:underline inline-flex items-center gap-1.5">
                          <LinkIcon size={13} /> Rattacher…
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">{fmtSize(d.size)}</td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">{fmtDate(d.uploaded_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => downloadDoc(d)} title="Télécharger" data-testid={`lib-dl-${d.id}`} className="h-7 w-7 inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded"><DownloadSimple size={14} /></button>
                        {d.stagiaire ? (
                          <button onClick={() => detachOne(d)} title="Détacher du stagiaire" data-testid={`lib-detach-${d.id}`} className="h-7 w-7 inline-flex items-center justify-center text-amber-600 hover:bg-amber-50 rounded"><LinkBreak size={14} /></button>
                        ) : (
                          <button onClick={() => setAttachFor(d)} title="Rattacher" data-testid={`lib-attach-icon-${d.id}`} className="h-7 w-7 inline-flex items-center justify-center text-navy hover:bg-blue-50 rounded"><LinkIcon size={14} /></button>
                        )}
                        <button onClick={() => deleteOne(d)} title="Supprimer" data-testid={`lib-del-${d.id}`} className="h-7 w-7 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded"><Trash size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 text-center">
          💡 Glissez-déposez des fichiers directement sur le tableau pour les importer
        </div>
      </div>

      <AttachDialog open={!!attachFor} document={attachFor} onClose={() => setAttachFor(null)} onAttached={load} />
    </div>
  );
}
