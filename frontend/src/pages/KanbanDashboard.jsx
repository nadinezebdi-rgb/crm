import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { STATUS_COLUMNS, STATUS_LABELS, formatDate } from "@/lib/dossiers";
import FinanceurBadge from "@/components/FinanceurBadge";
import EdofImportDialog from "@/components/EdofImportDialog";
import ClearDossiersDialog from "@/components/ClearDossiersDialog";
import ExportDialog from "@/components/ExportDialog";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { CheckCircle, ArrowRight, User, CalendarBlank, Plus, Spinner, FileArrowUp, Trash, DownloadSimple, ArrowsClockwise } from "@phosphor-icons/react";

function NextStatusButton({ dossier, onChange }) {
  const idx = STATUS_COLUMNS.findIndex((c) => c.id === dossier.status);
  if (dossier.status === "facture") {
    return (
      <button
        data-testid={`mark-paid-${dossier.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onChange(dossier, "regle");
        }}
        className="w-full mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded px-2 py-1.5 transition-colors"
      >
        <CheckCircle size={14} weight="bold" /> Marquer comme réglé
      </button>
    );
  }
  const next = STATUS_COLUMNS[idx + 1];
  if (!next) return null;
  return (
    <button
      data-testid={`advance-${dossier.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(dossier, next.id);
      }}
      className="w-full mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-600 hover:text-white hover:bg-navy border border-slate-200 rounded px-2 py-1.5 transition-colors"
    >
      Avancer <ArrowRight size={12} />
    </button>
  );
}

function DossierCard({ dossier, onChange }) {
  return (
    <div
      data-testid={`kanban-card-${dossier.id}`}
      className="bg-white p-3 rounded-md border border-slate-200 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-2 mb-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-900 font-display">
            {dossier.prenom} {dossier.nom}
          </div>
          {dossier.formation ? (
            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{dossier.formation}</div>
          ) : null}
        </div>
        <FinanceurBadge value={dossier.financeur_type} />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <User size={12} weight="bold" />
          {dossier.formateur_nom || "Non assigné"}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarBlank size={12} weight="bold" />
          {formatDate(dossier.date_entree)}
        </span>
      </div>
      <NextStatusButton dossier={dossier} onChange={onChange} />
    </div>
  );
}

function Column({ col, items, onChange, onDrop }) {
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
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id, col.id);
      }}
      className={`w-80 flex-shrink-0 flex flex-col h-full rounded-lg border ${
        over ? "border-brand-500 bg-brand-50/50" : "border-slate-200 bg-slate-100/60"
      } transition-colors`}
    >
      <div className="px-3 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-700 font-display">
            {col.title}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{col.hint}</div>
        </div>
        <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5">
          {items.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="text-[11px] text-slate-400 text-center py-8 italic">Aucun dossier</div>
        ) : (
          items.map((d) => (
            <div
              key={d.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
              className="cursor-grab active:cursor-grabbing"
            >
              <DossierCard dossier={d} onChange={onChange} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function KanbanDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/dossiers/active");
      setItems(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = async (d, newStatus) => {
    try {
      await api.patch(`/dossiers/${d.id}/status`, { status: newStatus });
      if (newStatus === "regle") {
        toast.success(`${d.prenom} ${d.nom} archivé(e) dans les dossiers clôturés`);
      } else {
        toast.success(`Statut : ${STATUS_LABELS[newStatus]}`);
      }
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    }
  };

  const handleDrop = (id, newStatus) => {
    const d = items.find((x) => x.id === id);
    if (!d || d.status === newStatus) return;
    handleChange(d, newStatus);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col" data-testid="kanban-page">
      <div className="px-8 py-5 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-display">Tableau de Bord</h1>
          <p className="text-xs text-slate-500 mt-1">Suivi visuel des dossiers en cours — Vue pipeline</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowImport(true)}
            data-testid="open-edof-import"
            className="inline-flex items-center gap-2 h-9 px-3 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors"
          >
            <FileArrowUp size={14} weight="bold" /> Importer EDOF
          </button>
          <button
            onClick={() => setShowExport(true)}
            data-testid="open-edof-export"
            className="inline-flex items-center gap-2 h-9 px-3 text-sm font-medium text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 rounded-md transition-colors"
          >
            <DownloadSimple size={14} weight="bold" /> Export EDOF
          </button>
          <button
            onClick={() => setShowClear(true)}
            data-testid="open-clear-dossiers"
            className="inline-flex items-center gap-2 h-9 px-3 text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-md transition-colors"
          >
            <ArrowsClockwise size={14} weight="bold" /> Reset
          </button>
          <Link
            to="/onboarding"
            data-testid="goto-onboarding"
            className="inline-flex items-center gap-2 h-9 px-4 text-sm font-semibold text-white bg-navy hover:bg-navy/90 rounded-md transition-colors"
          >
            <Plus size={14} weight="bold" /> Nouveau stagiaire
          </Link>
        </div>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          <Spinner size={18} className="mr-2 animate-spin" /> Chargement…
        </div>
      ) : (
        <div data-testid="kanban-board" className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-4">
          {STATUS_COLUMNS.map((col) => (
            <Column
              key={col.id}
              col={col}
              items={items.filter((d) => d.status === col.id)}
              onChange={handleChange}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}

      <EdofImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={load} />
      <ClearDossiersDialog open={showClear} onClose={() => setShowClear(false)} onCleared={load} />
      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
    </div>
  );
}
