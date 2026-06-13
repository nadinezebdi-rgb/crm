import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { FINANCEUR_TYPES } from "@/lib/dossiers";
import { toast } from "sonner";
import { X, UploadSimple, Spinner, FileArrowUp, CheckCircle, Warning } from "@phosphor-icons/react";

export default function EdofImportDialog({ open, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [formateurs, setFormateurs] = useState([]);
  const [defaultFormateur, setDefaultFormateur] = useState("");
  const [defaultFinanceur, setDefaultFinanceur] = useState("CPF");
  const [defaultFormation, setDefaultFormation] = useState("ANGLAIS");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    api.get("/formateurs").then(({ data }) => setFormateurs(data)).catch(() => {});
    setFile(null);
    setResult(null);
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Sélectionnez un fichier EDOF (.csv ou .xlsx)");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("default_financeur", defaultFinanceur);
      fd.append("default_formation", defaultFormation);
      if (defaultFormateur) fd.append("default_formateur_id", defaultFormateur);
      const { data } = await api.post("/dossiers-admin/import-edof", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      toast.success(`${data.created} dossier${data.created > 1 ? "s" : ""} importé${data.created > 1 ? "s" : ""}`);
      onImported && onImported();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur d'import");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "h-9 w-full text-sm border border-slate-300 rounded-md px-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      data-testid="edof-import-overlay"
    >
      <div
        className="bg-white w-full max-w-xl rounded-lg border border-slate-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="edof-import-dialog"
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-navy text-white flex items-center justify-center">
              <FileArrowUp size={16} weight="bold" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 font-display">Importer un fichier EDOF</div>
              <div className="text-[11px] text-slate-500">CSV ou Excel — création automatique des dossiers</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="edof-close">
            <X size={18} />
          </button>
        </div>

        {!result ? (
          <form onSubmit={submit} className="p-5 space-y-4">
            <label
              className="block border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-md p-6 text-center cursor-pointer bg-slate-50 transition-colors"
              data-testid="edof-dropzone"
            >
              <UploadSimple size={28} weight="duotone" className="mx-auto mb-2 text-slate-500" />
              <div className="text-sm font-semibold text-slate-700">
                {file ? file.name : "Cliquez pour sélectionner un fichier"}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">.csv, .xlsx — max 15 Mo</div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.xlsm"
                hidden
                data-testid="edof-file-input"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Financeur par défaut</label>
                <select
                  className={inputCls}
                  value={defaultFinanceur}
                  onChange={(e) => setDefaultFinanceur(e.target.value)}
                  data-testid="edof-default-financeur"
                >
                  {FINANCEUR_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Formation par défaut</label>
                <input
                  className={inputCls}
                  value={defaultFormation}
                  onChange={(e) => setDefaultFormation(e.target.value)}
                  data-testid="edof-default-formation"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Formateur attribué par défaut</label>
                <select
                  className={inputCls}
                  value={defaultFormateur}
                  onChange={(e) => setDefaultFormateur(e.target.value)}
                  data-testid="edof-default-formateur"
                >
                  <option value="">— Aucun (à attribuer ensuite) —</option>
                  {formateurs.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.prenom} {f.nom}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-slate-500 mt-1">
                  Vous pourrez réassigner individuellement chaque dossier ensuite.
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
              <div className="font-semibold text-slate-700 mb-1">Colonnes détectées automatiquement :</div>
              Nom · Prénom · Date de naissance · Adresse · Email · Téléphone · Date début · Date fin · Formation
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                data-testid="edof-import-submit"
                className="h-9 px-5 text-sm font-semibold text-white bg-navy hover:bg-navy/90 rounded-md inline-flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <Spinner size={14} className="animate-spin" /> : <UploadSimple size={14} weight="bold" />}
                Importer
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-4" data-testid="edof-import-result">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-md">
              <CheckCircle size={28} weight="duotone" className="text-emerald-600" />
              <div>
                <div className="text-sm font-bold text-emerald-900">{result.created} dossier(s) importé(s)</div>
                <div className="text-xs text-emerald-700">sur {result.total_rows} ligne(s) lue(s)</div>
              </div>
            </div>

            {result.skipped?.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="text-xs font-semibold text-amber-900 mb-1 flex items-center gap-1">
                  <Warning size={13} /> {result.skipped.length} ligne(s) ignorée(s)
                </div>
                <ul className="text-[11px] text-amber-800 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.skipped.slice(0, 10).map((s, i) => (
                    <li key={i}>Ligne {s.ligne} — {s.raison}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-[11px] text-slate-500">
              <div className="font-semibold text-slate-700 mb-1">Colonnes mappées :</div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(result.mapping_detected || {}).map(([k, v]) => (
                  <div key={k}>
                    <span className="font-medium">{k}</span> →{" "}
                    <span className={v ? "text-slate-700" : "text-slate-400 italic"}>{v || "non détecté"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={onClose}
                data-testid="edof-result-close"
                className="h-9 px-5 text-sm font-semibold text-white bg-navy hover:bg-navy/90 rounded-md"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
