import React, { useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UploadSimple, FileArrowUp, CheckCircle, Warning } from "@phosphor-icons/react";

/**
 * Import des stagiaires depuis un export EDOF / Mon Compte Formation (CPF).
 * Étape 1 : choix du fichier (CSV/XLSX) → étape 2 : vérification du mappage
 * des colonnes + aperçu → étape 3 : résultat de l'import.
 */
export default function ImportEdofDialog({ onDone }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [createSessions, setCreateSessions] = useState(true);
  const [groupement, setGroupement] = useState("mois");
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const reset = () => { setStep(1); setPreview(null); setMapping({}); setResult(null); setCreateSessions(true); };

  const uploadFile = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/import/edof/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(data);
      setMapping(data.mapping);
      setStep(2);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Lecture du fichier impossible");
    } finally { setLoading(false); }
  };

  const commit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/import/edof/commit", {
        rows: preview.rows,
        mapping,
        create_sessions: createSessions,
      });
      setResult(data);
      setStep(3);
      onDone?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Import impossible");
    } finally { setLoading(false); }
  };

  const previewRows = preview?.rows?.slice(0, 5) || [];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="edof-import-btn" className="border-brand-200 text-brand-700 hover:bg-brand-50">
        <UploadSimple size={16} className="mr-1.5" /> Importer EDOF (CPF)
      </Button>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="edof-import-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Import EDOF — Mon Compte Formation</DialogTitle>
          <DialogDescription>
            {step === 1 && "Déposez l'export de vos dossiers téléchargé depuis EDOF (CSV ou Excel)."}
            {step === 2 && `${preview?.total} ligne(s) détectée(s). Vérifiez la correspondance des colonnes avant l'import.`}
            {step === 3 && "Import terminé."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div
            className="border-2 border-dashed border-slate-300 hover:border-brand-400 rounded-lg p-10 text-center cursor-pointer transition-colors"
            onClick={() => fileRef.current?.click()}
            data-testid="edof-dropzone"
          >
            <FileArrowUp size={36} className="mx-auto text-brand-500 mb-3" />
            <p className="text-sm font-medium text-slate-700">{loading ? "Lecture du fichier…" : "Cliquez pour choisir votre fichier d'export EDOF"}</p>
            <p className="text-xs text-slate-500 mt-1">Formats acceptés : .csv, .xlsx — max 10 Mo</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm"
              className="hidden"
              data-testid="edof-file-input"
              onChange={(e) => uploadFile(e.target.files?.[0])}
            />
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-5 min-w-0 max-w-full">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Correspondance des colonnes</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {preview.fields.map((f) => (
                  <div key={f.key} className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-slate-600 w-36 shrink-0">
                      {f.label}{f.required && <span className="text-red-500"> *</span>}
                    </span>
                    <select
                      className="flex-1 min-w-0 h-8 text-xs rounded-md border border-slate-200 bg-white px-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      data-testid={`edof-mapping-${f.key}`}
                      value={mapping[f.key] || ""}
                      onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                    >
                      <option value="">— Ignorer —</option>
                      {preview.columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Aperçu (5 premières lignes)</h3>
              <div className="overflow-x-auto max-w-full rounded-md border border-slate-200">
                <table className="w-full text-xs" data-testid="edof-preview-table">
                  <thead className="bg-slate-50">
                    <tr>
                      {preview.fields.filter((f) => mapping[f.key]).map((f) => (
                        <th key={f.key} className="px-2.5 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {preview.fields.filter((f) => mapping[f.key]).map((f) => (
                          <td key={f.key} className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap max-w-[180px] truncate">{row[mapping[f.key]]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <label className="flex items-start gap-2.5 rounded-md border border-brand-100 bg-brand-50 p-3 cursor-pointer">
              <Checkbox checked={createSessions} onCheckedChange={(v) => setCreateSessions(!!v)} data-testid="edof-create-sessions" className="mt-0.5" />
              <span className="text-xs text-slate-700">
                <span className="font-semibold">Créer automatiquement les sessions de formation</span>
                <br />
                Les dossiers sont regroupés par formation et dates ; chaque groupe devient une session (rattachée au financeur CPF) avec ses stagiaires inscrits. Les dossiers annulés/refusés sont ignorés.
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} data-testid="edof-back-btn">Changer de fichier</Button>
              <Button onClick={commit} disabled={loading} data-testid="edof-commit-btn" className="bg-brand-600 hover:bg-brand-700">
                {loading ? "Import en cours…" : `Importer ${preview.total} ligne(s)`}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div className="space-y-4" data-testid="edof-result">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Apprenants créés", value: result.apprenants_crees },
                { label: "Apprenants déjà connus", value: result.apprenants_existants },
                { label: "Sessions créées", value: result.sessions_creees },
                { label: "Sessions complétées", value: result.sessions_maj },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-2xl font-display font-semibold text-brand-700">{s.value}</div>
                  <div className="text-xs text-slate-600">{s.label}</div>
                </div>
              ))}
            </div>
            {result.lignes_ignorees?.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-center gap-1.5 font-semibold mb-1"><Warning size={14} /> {result.lignes_ignorees.length} ligne(s) ignorée(s)</div>
                <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.lignes_ignorees.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle size={14} weight="fill" /> Toutes les lignes ont été traitées.</div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => { setOpen(false); reset(); }} data-testid="edof-close-btn" className="bg-navy hover:bg-navy-light text-white">Fermer</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
