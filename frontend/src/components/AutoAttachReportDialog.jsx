import React, { useState } from "react";
import { X, CheckCircle, Warning, FileText, MagnifyingGlass } from "@phosphor-icons/react";

function Section({ title, items, emptyText, tone, renderItem }) {
  const toneClasses = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    danger: "bg-red-50 border-red-200 text-red-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    neutral: "bg-slate-50 border-slate-200 text-slate-800",
  };
  return (
    <div className={`rounded-md border p-3 ${toneClasses[tone] || toneClasses.neutral}`}>
      <div className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[10px] bg-white/60 border border-current/20 rounded px-1.5 py-0.5">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] italic opacity-70">{emptyText}</div>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-y-auto text-[11px]">
          {items.slice(0, 200).map((it, i) => (
            <li key={it.id || i} className="bg-white/70 rounded px-2 py-1 border border-white">
              {renderItem(it)}
            </li>
          ))}
          {items.length > 200 && <li className="text-center opacity-60">… {items.length - 200} de plus</li>}
        </ul>
      )}
    </div>
  );
}

export default function AutoAttachReportDialog({ open, report, onClose }) {
  const [search, setSearch] = useState("");
  if (!open || !report) return null;

  const filter = (arr, fn) => {
    const term = search.trim().toLowerCase();
    if (!term) return arr;
    return arr.filter(fn);
  };

  const successes = filter(report.successes || [], (s) =>
    (s.filename || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.apprenant || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.numero_facture || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.numero_dossier || "").toLowerCase().includes(search.toLowerCase())
  );
  const anomalies = filter(report.anomalies || [], (a) =>
    (a.filename || "").toLowerCase().includes(search.toLowerCase()) ||
    (a.reason || "").toLowerCase().includes(search.toLowerCase())
  );
  const skipped = filter(report.skipped || [], (s) =>
    (s.filename || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="auto-attach-report-dialog"
    >
      <div
        className="bg-white w-full max-w-3xl rounded-lg border border-slate-200 shadow-xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-white">
          <div>
            <div className="text-base font-bold text-slate-900 font-display">Rapport d&apos;auto-rattachement</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {report.total_examined} document(s) analysé(s) ·
              <strong className="text-emerald-700"> {report.attached} rattaché(s)</strong> ·
              <strong className="text-red-700"> {report.anomalies?.length || 0} anomalie(s)</strong> ·
              <strong className="text-slate-600"> {report.skipped?.length || 0} ignoré(s)</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="auto-attach-report-close"
            className="h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              placeholder="Filtrer (nom de fichier, apprenant, n° facture, motif…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="auto-attach-report-search"
              className="h-9 pl-8 pr-3 w-full text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <Section
            title="✓ Rattachements effectués"
            items={successes}
            tone="success"
            emptyText="Aucun rattachement effectué"
            renderItem={(s) => (
              <div className="flex items-start gap-2">
                <CheckCircle size={13} weight="fill" className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.filename}</div>
                  <div className="opacity-80 mt-0.5">
                    → <strong>{s.apprenant}</strong>
                    {s.numero_facture && <span className="ml-1.5 text-[10px] opacity-70">(facture {s.numero_facture} · dossier {s.numero_dossier})</span>}
                  </div>
                </div>
              </div>
            )}
          />

          <Section
            title="⚠ Anomalies (à traiter manuellement)"
            items={anomalies}
            tone="danger"
            emptyText="Aucune anomalie"
            renderItem={(a) => (
              <div className="flex items-start gap-2">
                <Warning size={13} weight="fill" className="text-red-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.filename}</div>
                  <div className="opacity-80 mt-0.5">{a.reason}</div>
                </div>
              </div>
            )}
          />

          <Section
            title="↷ Fichiers ignorés (format non reconnu)"
            items={skipped}
            tone="neutral"
            emptyText="Aucun fichier ignoré"
            renderItem={(s) => (
              <div className="flex items-start gap-2">
                <FileText size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.filename}</div>
                  <div className="opacity-80 mt-0.5">{s.reason}</div>
                </div>
              </div>
            )}
          />
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            data-testid="auto-attach-report-done"
            className="h-9 px-4 text-sm font-semibold text-white bg-navy hover:bg-navy/90 rounded-md"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
