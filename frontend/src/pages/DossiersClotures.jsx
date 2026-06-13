import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
import FinanceurBadge from "@/components/FinanceurBadge";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Search, Archive, Loader2, FileText, Download, ChevronRight } from "lucide-react";
import { DOC_TYPES, DOC_TYPE_LABEL } from "@/lib/constants";

function ClosedDetail({ stagiaire, onClose }) {
  const [docs, setDocs] = useState([]);
  useEffect(() => {
    api.get(`/stagiaires/${stagiaire.id}/documents`).then(({ data }) => setDocs(data)).catch(() => {});
  }, [stagiaire]);

  const downloadDoc = (d) => {
    const url = `${api.defaults.baseURL}/documents/${d.id}/download`;
    window.open(url, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/30"
      onClick={onClose}
      data-testid="closed-detail-overlay"
    >
      <div
        className="w-full max-w-2xl bg-white shadow-xl border-l border-gray-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="closed-detail-panel"
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
          <div>
            <div className="text-base font-bold text-slate-900" style={{ fontFamily: "'Manrope', sans-serif" }}>
              {stagiaire.prenom} {stagiaire.nom}
            </div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400 mt-0.5">
              Archivé · {formatDate(stagiaire.date_cloture)}
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="closed-detail-close"
            className="h-8 px-3 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Fermer
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">
              Historique
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Email" value={stagiaire.email} />
              <Field label="Téléphone" value={stagiaire.telephone} />
              <Field label="Adresse" value={stagiaire.adresse} colSpan />
              <Field label="Formateur" value={stagiaire.formateur_nom} />
              <Field label="Financeur" value={<FinanceurBadge value={stagiaire.financeur} />} />
              <Field label="Détail financeur" value={stagiaire.financeur_detail} />
              <Field label="Formation" value={stagiaire.formation} />
              <Field label="Date d'entrée" value={formatDate(stagiaire.date_entree)} />
              <Field label="Début formation" value={formatDate(stagiaire.date_debut_formation)} />
              <Field label="Fin formation" value={formatDate(stagiaire.date_fin_formation)} />
              <Field label="Clôturé le" value={formatDate(stagiaire.date_cloture)} colSpan />
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">
              Documents sauvegardés
            </h3>
            <div className="space-y-2">
              {DOC_TYPES.map((t) => {
                const ofType = docs.filter((d) => d.type === t.id);
                return (
                  <div key={t.id} className="border border-gray-200 rounded-md p-3 bg-white">
                    <div className="text-sm font-medium text-slate-900 mb-1">{t.label}</div>
                    {ofType.length === 0 ? (
                      <div className="text-[11px] text-slate-400">Aucun document</div>
                    ) : (
                      <ul className="space-y-1">
                        {ofType.map((d) => (
                          <li
                            key={d.id}
                            data-testid={`closed-doc-${d.id}`}
                            className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded px-2 py-1.5"
                          >
                            <span className="inline-flex items-center gap-2 truncate text-slate-700">
                              <FileText className="h-3.5 w-3.5 text-slate-500" />
                              {d.original_filename}
                            </span>
                            <button
                              onClick={() => downloadDoc(d)}
                              data-testid={`closed-download-${d.id}`}
                              className="h-6 w-6 inline-flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
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

function Field({ label, value, colSpan }) {
  return (
    <div className={colSpan ? "col-span-2" : ""}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 mt-0.5">{value || "—"}</div>
    </div>
  );
}

export default function DossiersClotures() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/stagiaires/closed");
      setItems(data);
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
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (s) =>
        s.nom?.toLowerCase().includes(term) ||
        s.prenom?.toLowerCase().includes(term) ||
        s.financeur_detail?.toLowerCase().includes(term) ||
        s.formateur_nom?.toLowerCase().includes(term) ||
        s.formation?.toLowerCase().includes(term)
    );
  }, [items, q]);

  return (
    <>
      <PageHeader
        title="Dossiers Clôturés"
        subtitle="Coffre-fort numérique des dossiers réglés"
        testid="archives-header"
      />
      <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-5">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                data-testid="search-dossiers-input"
                autoFocus
                placeholder="Rechercher par nom, prénom, OPCO, formateur, formation…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-10 w-full pl-10 pr-3 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none"
              />
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {filtered.length} dossier{filtered.length > 1 ? "s" : ""} archivé{filtered.length > 1 ? "s" : ""}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center text-slate-400 py-20">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-slate-400 py-16 text-sm bg-white rounded-lg border border-dashed border-slate-200">
              <Archive className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              Aucun dossier clôturé
              <div className="text-xs mt-1">Les dossiers réglés apparaîtront ici automatiquement</div>
            </div>
          ) : (
            <div data-testid="closed-list" className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-gray-200">
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="text-left px-4 py-3 font-semibold">Stagiaire</th>
                    <th className="text-left px-4 py-3 font-semibold">Formation</th>
                    <th className="text-left px-4 py-3 font-semibold">Formateur</th>
                    <th className="text-left px-4 py-3 font-semibold">Financeur</th>
                    <th className="text-left px-4 py-3 font-semibold">Clôturé le</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr
                      key={s.id}
                      data-testid={`closed-row-${s.id}`}
                      onClick={() => setSelected(s)}
                      className="border-b border-gray-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{s.prenom} {s.nom}</div>
                        <div className="text-[11px] text-slate-400">{s.email || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{s.formation || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{s.formateur_nom || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <FinanceurBadge value={s.financeur} />
                          {s.financeur_detail ? (
                            <span className="text-[11px] text-slate-500">{s.financeur_detail}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatDate(s.date_cloture)}</td>
                      <td className="px-2 py-3 text-slate-400">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {selected ? <ClosedDetail stagiaire={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
