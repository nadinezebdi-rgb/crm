import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { STATUS_COLUMNS, STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import FinanceurBadge from "@/components/FinanceurBadge";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { CheckCircle2, ArrowRight, User, CalendarClock, MoreHorizontal, Loader2 } from "lucide-react";

function NextStatusButton({ stagiaire, onChange }) {
  const currentIndex = STATUS_COLUMNS.findIndex((c) => c.id === stagiaire.status);
  const next = STATUS_COLUMNS[currentIndex + 1];
  if (!next && stagiaire.status !== "facture") return null;

  if (stagiaire.status === "facture") {
    return (
      <button
        data-testid={`mark-paid-${stagiaire.id}`}
        onClick={() => onChange(stagiaire, "regle")}
        className="w-full mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded px-2 py-1.5 transition-colors"
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Marquer comme réglé
      </button>
    );
  }
  return (
    <button
      data-testid={`advance-${stagiaire.id}`}
      onClick={() => onChange(stagiaire, next.id)}
      className="w-full mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-600 hover:text-white hover:bg-slate-900 border border-slate-200 rounded px-2 py-1.5 transition-colors"
    >
      Avancer <ArrowRight className="h-3 w-3" />
    </button>
  );
}

function StagiaireCard({ stagiaire, onChange }) {
  return (
    <div
      data-testid={`kanban-card-${stagiaire.id}`}
      className="bg-white p-3 rounded-md border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-2 mb-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-900" style={{ fontFamily: "'Manrope', sans-serif" }}>
            {stagiaire.prenom} {stagiaire.nom}
          </div>
          {stagiaire.formation ? (
            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{stagiaire.formation}</div>
          ) : null}
        </div>
        <FinanceurBadge value={stagiaire.financeur} />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" />
          {stagiaire.formateur_nom || "Non assigné"}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3" />
          {formatDate(stagiaire.date_entree)}
        </span>
      </div>
      <NextStatusButton stagiaire={stagiaire} onChange={onChange} />
    </div>
  );
}

function Column({ col, items, onChange, onDrop, onDragStart }) {
  const [over, setOver] = useState(false);
  return (
    <div
      data-testid={`kanban-column-${col.id}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const sid = e.dataTransfer.getData("text/plain");
        if (sid) onDrop(sid, col.id);
      }}
      className={`w-80 flex-shrink-0 flex flex-col h-full rounded-lg border ${
        over ? "border-slate-900 bg-slate-50" : "border-gray-200 bg-gray-100/60"
      } transition-colors`}
    >
      <div className="px-3 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-700" style={{ fontFamily: "'Manrope', sans-serif" }}>
            {col.title}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{col.hint}</div>
        </div>
        <span className="text-[11px] font-semibold text-slate-500 bg-white border border-gray-200 rounded px-1.5 py-0.5">
          {items.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="text-[11px] text-slate-400 text-center py-8 italic">Aucun dossier</div>
        ) : (
          items.map((s) => (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", s.id);
                onDragStart(s.id);
              }}
              className="cursor-grab active:cursor-grabbing"
            >
              <StagiaireCard stagiaire={s} onChange={onChange} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stagiaires, setStagiaires] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/stagiaires/active");
      setStagiaires(data);
    } catch (e) {
      toast.error("Impossible de charger les dossiers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = async (s, newStatus) => {
    try {
      await api.patch(`/stagiaires/${s.id}/status`, { status: newStatus });
      if (newStatus === "regle") {
        toast.success(`${s.prenom} ${s.nom} archivé(e) dans les dossiers clôturés`);
      } else {
        toast.success(`Statut mis à jour : ${STATUS_LABELS[newStatus]}`);
      }
      load();
    } catch (e) {
      toast.error("Erreur lors du changement de statut");
    }
  };

  const handleDrop = async (id, newStatus) => {
    const s = stagiaires.find((x) => x.id === id);
    if (!s || s.status === newStatus) return;
    handleChange(s, newStatus);
  };

  const groupedItems = (status) => stagiaires.filter((s) => s.status === status);

  return (
    <>
      <PageHeader
        title="Tableau de Bord"
        subtitle="Suivi visuel des dossiers en cours — Vue pipeline"
        testid="dashboard-header"
      />
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Chargement…
        </div>
      ) : (
        <div data-testid="kanban-board" className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-4">
          {STATUS_COLUMNS.map((col) => (
            <Column
              key={col.id}
              col={col}
              items={groupedItems(col.id)}
              onChange={handleChange}
              onDrop={handleDrop}
              onDragStart={() => {}}
            />
          ))}
        </div>
      )}
    </>
  );
}
