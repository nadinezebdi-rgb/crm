import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  X,
  DownloadSimple,
  Link as LinkIcon,
  MagnifyingGlass,
  FilePdf,
  FileXls,
  FileImage,
  FileDoc,
  FileText,
  Eye,
  Spinner,
  CheckCircle,
} from "@phosphor-icons/react";

function isPdf(d) {
  return (d?.content_type || "").includes("pdf") || (d?.original_filename || "").toLowerCase().endsWith(".pdf");
}

function isImage(d) {
  const ext = (d?.original_filename || "").split(".").pop().toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || (d?.content_type || "").startsWith("image/");
}

function isText(d) {
  const ext = (d?.original_filename || "").split(".").pop().toLowerCase();
  return ["txt", "log", "json", "xml", "html", "md"].includes(ext) || ((d?.content_type || "").startsWith("text/") && ext !== "csv");
}

function isSpreadsheet(d) {
  const ext = (d?.original_filename || "").split(".").pop().toLowerCase();
  return ["xlsx", "xlsm", "xls", "csv"].includes(ext);
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
    return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function fileIcon(d) {
  if (isPdf(d)) return <FilePdf size={28} weight="duotone" className="text-red-500" />;
  if (isImage(d)) return <FileImage size={28} weight="duotone" className="text-amber-500" />;
  const ext = (d?.original_filename || "").split(".").pop().toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileXls size={28} weight="duotone" className="text-emerald-600" />;
  if (["doc", "docx"].includes(ext)) return <FileDoc size={28} weight="duotone" className="text-blue-600" />;
  return <FileText size={28} weight="duotone" className="text-slate-500" />;
}

export default function DocumentPreviewDialog({ open, document, onClose, onAttached, onDeleted }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [sheets, setSheets] = useState(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [dossiers, setDossiers] = useState([]);
  const [attachQ, setAttachQ] = useState("");
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    if (!open || !document) return;
    let cancelled = false;
    let createdUrl = null;
    (async () => {
      setLoading(true);
      setBlobUrl(null);
      setTextContent(null);
      setSheets(null);
      setActiveSheet(0);
      setAttachOpen(false);
      setAttachQ("");
      try {
        if (isSpreadsheet(document)) {
          // Aperçu HTML pour Excel/CSV
          const { data } = await api.get(`/library/${document.id}/preview-html`);
          if (!cancelled) {
            setSheets(data.sheets || []);
            // On charge aussi le blob pour permettre le téléchargement direct depuis l'aperçu
            const res = await api.get(`/library/${document.id}/preview`, { responseType: "blob" });
            if (!cancelled) {
              const blob = new Blob([res.data], { type: document.content_type || "application/octet-stream" });
              createdUrl = URL.createObjectURL(blob);
              setBlobUrl(createdUrl);
            }
          }
        } else {
          const res = await api.get(`/library/${document.id}/preview`, { responseType: "blob" });
          if (cancelled) return;
          const blob = new Blob([res.data], { type: document.content_type || "application/octet-stream" });
          if (isText(document)) {
            const txt = await blob.text();
            if (!cancelled) setTextContent(txt.slice(0, 200000));
          } else {
            createdUrl = URL.createObjectURL(blob);
            if (!cancelled) setBlobUrl(createdUrl);
          }
        }
      } catch (e) {
        if (!cancelled) toast.error("Aperçu indisponible");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, document]);

  useEffect(() => {
    if (!attachOpen) return;
    api.get("/dossiers/active").then(({ data }) => setDossiers(data)).catch(() => {});
  }, [attachOpen]);

  const filteredDossiers = useMemo(() => {
    const term = attachQ.trim().toLowerCase();
    const list = term
      ? dossiers.filter(
          (d) =>
            d.nom?.toLowerCase().includes(term) ||
            d.prenom?.toLowerCase().includes(term) ||
            d.formation?.toLowerCase().includes(term) ||
            d.financeur_nom?.toLowerCase().includes(term)
        )
      : dossiers;
    return list.slice(0, 50);
  }, [dossiers, attachQ]);

  if (!open || !document) return null;

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = window.document.createElement("a");
    a.href = blobUrl;
    a.download = document.original_filename || "document";
    window.document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleAttach = async (dossier) => {
    setAttaching(true);
    try {
      await api.patch(`/library/${document.id}/attach`, { dossier_id: dossier.id });
      toast.success(`Document ajouté au dossier de ${dossier.prenom} ${dossier.nom}`);
      onAttached && onAttached();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    } finally {
      setAttaching(false);
    }
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full text-slate-400 text-sm">
          <Spinner size={18} className="animate-spin mr-2" /> Chargement de l'aperçu…
        </div>
      );
    }
    if (isPdf(document) && blobUrl) {
      return (
        <iframe
          src={blobUrl}
          title={document.original_filename}
          data-testid="preview-pdf"
          className="w-full h-full border-0 bg-white"
        />
      );
    }
    if (isImage(document) && blobUrl) {
      return (
        <div className="flex items-center justify-center w-full h-full bg-slate-100 p-4 overflow-auto">
          <img src={blobUrl} alt={document.original_filename} data-testid="preview-image" className="max-w-full max-h-full object-contain shadow" />
        </div>
      );
    }
    if (sheets && sheets.length > 0) {
      const current = sheets[activeSheet] || sheets[0];
      return (
        <div data-testid="preview-spreadsheet" className="w-full h-full flex flex-col bg-white">
          {sheets.length > 1 && (
            <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 bg-slate-50 border-b border-slate-200 overflow-x-auto">
              {sheets.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSheet(i)}
                  data-testid={`preview-sheet-${i}`}
                  className={`text-xs px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                    i === activeSheet ? "bg-navy text-white font-semibold" : "text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div
            className="flex-1 overflow-auto p-4 xls-preview"
            dangerouslySetInnerHTML={{ __html: current.html }}
          />
          <style>{`
            .xls-preview .xls-table { border-collapse: collapse; font-size: 12px; background: white; }
            .xls-preview .xls-table thead th { background: #0F172A; color: white; font-weight: 600; padding: 6px 10px; border: 1px solid #1E293B; position: sticky; top: 0; white-space: nowrap; text-align: left; }
            .xls-preview .xls-table tbody td { padding: 5px 10px; border: 1px solid #E2E8F0; color: #0F172A; vertical-align: top; }
            .xls-preview .xls-table tbody tr:nth-child(even) td { background: #F8FAFC; }
            .xls-preview .xls-table tbody tr:hover td { background: #DBEAFE; }
            .xls-preview .xls-table .trunc { background: #FEF3C7; color: #92400E; font-style: italic; text-align: center; padding: 8px; }
            .xls-preview .xls-table .empty { color: #94A3B8; font-style: italic; padding: 16px; text-align: center; }
          `}</style>
        </div>
      );
    }
    if (textContent !== null) {
      return (
        <pre data-testid="preview-text" className="w-full h-full bg-white text-xs text-slate-800 p-4 overflow-auto whitespace-pre-wrap font-mono">
          {textContent}
        </pre>
      );
    }
    // Fallback : pas d'aperçu (Excel/Word) — affiche les métadonnées + bouton télécharger
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-8 text-center" data-testid="preview-fallback">
        <div className="h-20 w-20 bg-white rounded-lg border border-slate-200 flex items-center justify-center mb-4 shadow-sm">
          {fileIcon(document)}
        </div>
        <div className="text-sm font-bold text-slate-900 max-w-md truncate">{document.original_filename}</div>
        <div className="text-xs text-slate-500 mt-1">
          {(document.content_type || "Type inconnu")} · {fmtSize(document.size)}
        </div>
        <p className="text-xs text-slate-500 mt-4 max-w-sm">
          L'aperçu intégré n'est pas disponible pour ce type de fichier. Téléchargez-le pour l'ouvrir dans votre logiciel habituel (Excel, Word, etc.).
        </p>
        <button
          onClick={handleDownload}
          data-testid="preview-fallback-download"
          className="mt-5 h-9 px-4 text-sm font-semibold text-white bg-navy hover:bg-navy/90 rounded-md inline-flex items-center gap-2"
        >
          <DownloadSimple size={14} weight="bold" /> Télécharger le fichier
        </button>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="document-preview-overlay"
    >
      <div
        className="bg-white w-full max-w-5xl h-[90vh] rounded-lg border border-slate-200 shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="document-preview-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 h-16 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {fileIcon(document)}
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 font-display truncate" title={document.original_filename}>
                {document.original_filename}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{fmtSize(document.size)}</span>
                <span>·</span>
                <span>Importé le {fmtDate(document.uploaded_at)}</span>
                {document.stagiaire ? (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle size={11} weight="fill" /> Rattaché à {document.stagiaire.prenom} {document.stagiaire.nom}
                    </span>
                  </>
                ) : (
                  <>
                    <span>·</span>
                    <span className="text-amber-700">Non rattaché</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownload}
              disabled={!blobUrl && textContent === null}
              data-testid="preview-download-btn"
              className="h-9 px-3 text-xs font-semibold text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <DownloadSimple size={13} weight="bold" /> Télécharger
            </button>
            {!document.stagiaire && (
              <button
                onClick={() => setAttachOpen((v) => !v)}
                data-testid="preview-attach-btn"
                className={`h-9 px-3 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors ${
                  attachOpen ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                }`}
              >
                <LinkIcon size={13} weight="bold" /> Mettre dans un dossier
              </button>
            )}
            <button onClick={onClose} data-testid="preview-close-btn" className="h-9 w-9 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Preview area */}
          <div className="flex-1 min-w-0 bg-slate-100 overflow-hidden">
            {renderPreview()}
          </div>

          {/* Attach panel */}
          {attachOpen && !document.stagiaire && (
            <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col" data-testid="preview-attach-panel">
              <div className="px-4 h-12 flex items-center justify-between border-b border-slate-200">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-600">Rattacher au dossier</div>
                <button onClick={() => setAttachOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
              </div>
              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <MagnifyingGlass size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    autoFocus
                    placeholder="Nom, prénom, formation, OPCO…"
                    value={attachQ}
                    onChange={(e) => setAttachQ(e.target.value)}
                    data-testid="preview-attach-search"
                    className="h-8 w-full pl-8 pr-3 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {filteredDossiers.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-6">
                    Aucun stagiaire trouvé.{" "}
                    <Link to="/onboarding" className="text-navy underline">Créer ?</Link>
                  </div>
                ) : (
                  filteredDossiers.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleAttach(d)}
                      disabled={attaching}
                      data-testid={`preview-attach-row-${d.id}`}
                      className="w-full text-left p-2 mb-1 rounded hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors disabled:opacity-50"
                    >
                      <div className="text-sm font-medium text-slate-900">{d.prenom} {d.nom}</div>
                      <div className="text-[11px] text-slate-500">
                        {d.formation || "—"} · {d.financeur_type}
                        {d.financeur_nom ? ` · ${d.financeur_nom}` : ""}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
