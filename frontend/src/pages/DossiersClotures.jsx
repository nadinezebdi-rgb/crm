import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatDate } from "@/lib/dossiers";
import FinanceurBadge from "@/components/FinanceurBadge";
import DossierDrawer from "@/components/DossierDrawer";
import { toast } from "sonner";
import { MagnifyingGlass, Archive, Spinner, CaretRight } from "@phosphor-icons/react";

export default function DossiersClotures() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/dossiers/closed");
      setItems(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (s) =>
        s.nom?.toLowerCase().includes(term) ||
        s.prenom?.toLowerCase().includes(term) ||
        s.financeur_nom?.toLowerCase().includes(term) ||
        s.formateur_nom?.toLowerCase().includes(term) ||
        s.formation?.toLowerCase().includes(term)
    );
  }, [items, q]);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="px-8 py-5 border-b border-slate-200 bg-white">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 font-display">Dossiers Clôturés</h1>
        <p className="text-xs text-slate-500 mt-1">Coffre-fort numérique des dossiers réglés</p>
      </div>

      <div className="p-8 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 mb-5">
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-3 text-slate-400" />
              <input data-testid="search-dossiers-input" autoFocus
                placeholder="Rechercher par nom, prénom, OPCO, formateur, formation…"
                value={q} onChange={(e) => setQ(e.target.value)}
                className="h-10 w-full pl-10 pr-3 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {filtered.length} dossier{filtered.length > 1 ? "s" : ""} archivé{filtered.length > 1 ? "s" : ""}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center text-slate-400 py-20">
              <Spinner size={18} className="mr-2 animate-spin" /> Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-slate-400 py-16 text-sm bg-white rounded-lg border border-dashed border-slate-200">
              <Archive size={40} weight="duotone" className="mx-auto mb-3 text-slate-300" />
              Aucun dossier clôturé
              <div className="text-xs mt-1">Les dossiers réglés apparaîtront ici automatiquement</div>
            </div>
          ) : (
            <div data-testid="closed-list" className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
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
                    <tr key={s.id} data-testid={`closed-row-${s.id}`} onClick={() => setSelected(s)}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{s.prenom} {s.nom}</div>
                        <div className="text-[11px] text-slate-400">{s.email || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{s.formation || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{s.formateur_nom || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <FinanceurBadge value={s.financeur_type} />
                          {s.financeur_nom ? <span className="text-[11px] text-slate-500">{s.financeur_nom}</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatDate(s.date_cloture)}</td>
                      <td className="px-2 py-3 text-slate-400"><CaretRight size={14} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <DossierDrawer dossier={selected} mode="readonly" onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
