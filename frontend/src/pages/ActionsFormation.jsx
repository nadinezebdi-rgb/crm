import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { STATUS_LABELS, STATUS_COLUMNS, formatDate } from "@/lib/dossiers";
import FinanceurBadge from "@/components/FinanceurBadge";
import DossierDrawer from "@/components/DossierDrawer";
import { toast } from "sonner";
import { MagnifyingGlass, GraduationCap, Spinner } from "@phosphor-icons/react";

export default function ActionsFormation() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/dossiers/active");
      setItems(data);
      if (selected) {
        const fresh = data.find((s) => s.id === selected.id);
        setSelected(fresh || null);
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.nom?.toLowerCase().includes(q) ||
        s.prenom?.toLowerCase().includes(q) ||
        s.formation?.toLowerCase().includes(q) ||
        s.formateur_nom?.toLowerCase().includes(q) ||
        s.financeur_nom?.toLowerCase().includes(q)
      );
    });
  }, [items, filter, statusFilter]);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="px-8 py-5 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-display">Actions de Formation</h1>
          <p className="text-xs text-slate-500 mt-1">Fiches individuelles des programmes en cours</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input data-testid="actions-search" placeholder="Rechercher…" value={filter} onChange={(e) => setFilter(e.target.value)}
              className="h-9 pl-8 pr-3 text-sm border border-slate-300 rounded-md w-64 focus:ring-2 focus:ring-brand-500 outline-none" />
          </div>
          <select data-testid="actions-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-slate-300 rounded-md bg-white">
            <option value="all">Tous statuts actifs</option>
            {STATUS_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
      </div>

      <div className="p-6 bg-slate-50">
        {loading ? (
          <div className="flex items-center justify-center text-slate-400 py-20">
            <Spinner size={18} className="mr-2 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-16 text-sm">
            <GraduationCap size={32} weight="duotone" className="mx-auto mb-2 text-slate-300" />
            Aucun dossier en cours
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <button key={s.id} data-testid={`action-card-${s.id}`} onClick={() => setSelected(s)}
                className="text-left bg-white border border-slate-200 rounded-md p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="leading-tight">
                    <div className="text-sm font-semibold text-slate-900 font-display">{s.prenom} {s.nom}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{s.formation || "—"}</div>
                  </div>
                  <FinanceurBadge value={s.financeur_type} />
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
        <DossierDrawer
          dossier={selected}
          mode="edit"
          onClose={() => setSelected(null)}
          onUpdated={load}
          onDeleted={() => { setSelected(null); load(); }}
        />
      ) : null}
    </div>
  );
}
