import React, { useState } from "react";
import api, { API_BASE } from "@/lib/api";
import { toast } from "sonner";
import { X, DownloadSimple, FileXls, FileCsv, Spinner } from "@phosphor-icons/react";

export default function ExportDialog({ open, onClose }) {
  const [format, setFormat] = useState("xlsx");
  const [scope, setScope] = useState("all");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = `${API_BASE}/dossiers-admin/export?format=${format}&scope=${scope}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `export.${format}`;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
      toast.success("Export téléchargé");
      onClose && onClose();
    } catch (e) {
      toast.error("Erreur lors de l'export");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      data-testid="export-dialog-overlay"
    >
      <div
        className="bg-white w-full max-w-md rounded-lg border border-slate-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="export-dialog"
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-emerald-600 text-white flex items-center justify-center">
              <DownloadSimple size={15} weight="bold" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 font-display">Télécharger Export EDOF</div>
              <div className="text-[11px] text-slate-500">CSV ou Excel</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="export-close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setFormat("xlsx")} data-testid="export-format-xlsx"
                className={`flex items-center gap-2 p-3 border rounded-md transition-colors ${
                  format === "xlsx" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}>
                <FileXls size={20} weight="duotone" />
                <div className="text-left">
                  <div className="text-sm font-semibold">Excel</div>
                  <div className="text-[10px]">.xlsx mis en forme</div>
                </div>
              </button>
              <button type="button" onClick={() => setFormat("csv")} data-testid="export-format-csv"
                className={`flex items-center gap-2 p-3 border rounded-md transition-colors ${
                  format === "csv" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}>
                <FileCsv size={20} weight="duotone" />
                <div className="text-left">
                  <div className="text-sm font-semibold">CSV</div>
                  <div className="text-[10px]">point-virgule</div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Périmètre</label>
            <div className="space-y-1.5">
              {[
                { v: "all", label: "Tous les dossiers", hint: "Actifs + archivés" },
                { v: "active", label: "Dossiers actifs", hint: "Kanban en cours" },
                { v: "closed", label: "Archives", hint: "Dossiers réglés" },
              ].map((opt) => (
                <label key={opt.v} className="flex items-start gap-2 p-2 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                  <input type="radio" name="scope" value={opt.v} checked={scope === opt.v} onChange={(e) => setScope(e.target.value)} data-testid={`export-scope-${opt.v}`} />
                  <div>
                    <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              Annuler
            </button>
            <button type="submit" disabled={loading} data-testid="export-submit"
              className="h-9 px-5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md inline-flex items-center gap-2 disabled:opacity-50">
              {loading ? <Spinner size={14} className="animate-spin" /> : <DownloadSimple size={14} weight="bold" />}
              Télécharger
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
