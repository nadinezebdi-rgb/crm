import React, { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { X, Trash, Warning, Spinner } from "@phosphor-icons/react";

export default function ClearDossiersDialog({ open, onClose, onCleared }) {
  const [scope, setScope] = useState("all"); // all | active | closed
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const expected = "RESET";

  const submit = async (e) => {
    e.preventDefault();
    if (confirmText !== expected) {
      toast.error(`Veuillez taper exactement « ${expected} »`);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.delete(`/dossiers-admin/clear?scope=${scope}`);
      toast.success(`${data.deleted} dossier(s) supprimé(s) · ${data.documents_deleted} document(s)`);
      setConfirmText("");
      onCleared && onCleared();
      onClose && onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      data-testid="clear-dialog-overlay"
    >
      <div
        className="bg-white w-full max-w-md rounded-lg border border-slate-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="clear-dialog"
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-red-600 text-white flex items-center justify-center">
              <Trash size={15} weight="bold" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 font-display">Reset des dossiers</div>
              <div className="text-[11px] text-slate-500">Supprime tout — compteurs à zéro</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="clear-close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-md flex gap-2.5">
            <Warning size={18} weight="duotone" className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-900">
              Cette action <strong>supprime définitivement</strong> les dossiers stagiaires et leurs documents (devis, factures…). Tous les compteurs reviendront à zéro. Aucune restauration possible.
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Périmètre de suppression</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 p-2.5 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="scope" value="all" checked={scope === "all"} onChange={(e) => setScope(e.target.value)} data-testid="scope-all" />
                <div>
                  <div className="text-sm font-medium text-slate-900">Tous les dossiers</div>
                  <div className="text-[11px] text-slate-500">Actifs + archivés. Reset complet.</div>
                </div>
              </label>
              <label className="flex items-start gap-2 p-2.5 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="scope" value="active" checked={scope === "active"} onChange={(e) => setScope(e.target.value)} data-testid="scope-active" />
                <div>
                  <div className="text-sm font-medium text-slate-900">Uniquement les dossiers actifs</div>
                  <div className="text-[11px] text-slate-500">Vide le Kanban. Conserve les archives.</div>
                </div>
              </label>
              <label className="flex items-start gap-2 p-2.5 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="scope" value="closed" checked={scope === "closed"} onChange={(e) => setScope(e.target.value)} data-testid="scope-closed" />
                <div>
                  <div className="text-sm font-medium text-slate-900">Uniquement les archives</div>
                  <div className="text-[11px] text-slate-500">Vide les dossiers clôturés. Conserve l&apos;actif.</div>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pour confirmer, tapez <code className="text-red-700 bg-red-50 px-1 rounded">{expected}</code>
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              data-testid="clear-confirm-input"
              className="h-9 w-full text-sm border border-slate-300 rounded-md px-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              placeholder={expected}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              Annuler
            </button>
            <button type="submit" disabled={loading || confirmText !== expected} data-testid="clear-submit"
              className="h-9 px-5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md inline-flex items-center gap-2 disabled:opacity-50">
              {loading ? <Spinner size={14} className="animate-spin" /> : <Trash size={14} weight="bold" />}
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
