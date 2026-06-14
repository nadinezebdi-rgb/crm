import React, { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UploadSimple, MagnifyingGlass, Receipt, CalendarPlus, Trash, X } from "@phosphor-icons/react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import Pagination from "@/components/Pagination";

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const fmtEur = (v) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");

const moisLabel = (m) => {
  const [y, mm] = m.split("-");
  return `${MOIS[parseInt(mm, 10) - 1]} ${y.slice(2)}`;
};

export default function Facturation() {
  const [stats, setStats] = useState(null);
  const [factures, setFactures] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef(null);

  const visibleFactures = factures.slice((page - 1) * pageSize, page * pageSize);
  const allVisibleSelected = visibleFactures.length > 0 && visibleFactures.every((f) => selected.has(f.id));

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleFactures.forEach((f) => next.delete(f.id));
      else visibleFactures.forEach((f) => next.add(f.id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const deleteOne = async (f) => {
    if (!window.confirm(`Supprimer la facture ${f.numero_facture || f.numero_dossier || f.id.slice(0, 8)} ?`)) return;
    try {
      await api.delete(`/factures-cpf/${f.id}`);
      toast.success("Facture supprimée");
      setSelected((prev) => { const n = new Set(prev); n.delete(f.id); return n; });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Suppression impossible");
    }
  };

  const deleteBulk = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Supprimer ${selected.size} facture(s) sélectionnée(s) ? Cette action est irréversible.`)) return;
    setDeleting(true);
    try {
      const { data } = await api.delete("/factures-cpf/bulk", { data: { ids: Array.from(selected) } });
      toast.success(`${data.deleted} facture(s) supprimée(s)`);
      clearSelection();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Suppression impossible");
    } finally {
      setDeleting(false);
    }
  };

  const deleteAll = async () => {
    const total = factures.length;
    const txt = window.prompt(`Cette action va supprimer DÉFINITIVEMENT les ${total} facture(s) CPF. Pour confirmer, tapez SUPPRIMER ci-dessous :`);
    if (txt !== "SUPPRIMER") {
      if (txt !== null) toast.error("Confirmation incorrecte");
      return;
    }
    setDeleting(true);
    try {
      const { data } = await api.delete("/factures-cpf/all");
      toast.success(`${data.deleted} facture(s) supprimée(s) — base remise à zéro`);
      clearSelection();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Suppression impossible");
    } finally {
      setDeleting(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: f }] = await Promise.all([
        api.get("/factures-cpf/stats"),
        api.get("/factures-cpf", { params: search ? { q: search } : {} }),
      ]);
      setStats(s);
      setFactures(f);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setPage(1);
    const t = setTimeout(() => { if (!cancelled) load(); }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const importFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/factures-cpf/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Import terminé : ${data.importees} facture(s) importée(s), ${data.mises_a_jour} mise(s) à jour`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Import impossible");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const chartData = (stats?.par_mois || []).map((m) => ({ name: moisLabel(m.mois), versé: m.verse, facturé: m.total }));

  const generateMonthlySessions = async () => {
    if (!stats?.nb_factures) {
      toast.error("Aucune facture CPF à analyser");
      return;
    }
    const nbMois = (stats.par_mois || []).length;
    if (!window.confirm(
      `Cela va créer ou mettre à jour ${nbMois} session(s) — une par mois — à partir de vos ${stats.nb_factures} facture(s) CPF.\n\n` +
      `Les sessions seront nommées « CPF — mois année », rattachées au financeur CPF, avec leurs stagiaires liés (via le n° de dossier).\n\n` +
      `L'opération est idempotente : relancer mettra simplement à jour les sessions existantes.`
    )) return;
    setGenerating(true);
    try {
      const { data } = await api.post("/sessions/generer-depuis-factures-cpf");
      toast.success(
        `${data.sessions_creees} session(s) créée(s), ${data.sessions_maj} mise(s) à jour. ` +
        `Consultez la page Sessions pour les retrouver.`
      );
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Génération impossible");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 lg:p-8" data-testid="facturation-page">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Pilotage</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 mt-1">Facturation CPF</h1>
          <p className="text-sm text-slate-500 mt-1">Suivi des encaissements Mon Compte Formation (export Factures EDOF).</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° de dossier ou facture…"
              className="pl-9 w-64 bg-white"
              data-testid="factures-search"
            />
          </div>
          <Button
            onClick={deleteAll}
            disabled={deleting || !factures.length}
            data-testid="factures-delete-all-btn"
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
            title="Supprimer toutes les factures CPF"
          >
            <Trash size={16} className="mr-1.5" /> Tout supprimer
          </Button>
          <Button
            onClick={generateMonthlySessions}
            disabled={generating || !stats?.nb_factures}
            data-testid="factures-generer-sessions-btn"
            variant="outline"
            className="border-brand-200 text-brand-700 hover:bg-brand-50"
            title="Crée une session par mois à partir des factures CPF importées"
          >
            <CalendarPlus size={16} className="mr-1.5" /> {generating ? "Génération…" : "Générer sessions par mois"}
          </Button>
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            data-testid="factures-import-btn"
            className="bg-brand-600 hover:bg-brand-700"
          >
            <UploadSimple size={16} className="mr-1.5" /> {importing ? "Import…" : "Importer l'export EDOF"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm"
            className="hidden"
            data-testid="factures-file-input"
            onChange={(e) => importFile(e.target.files?.[0])}
          />
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Factures", value: stats?.nb_factures ?? "—", testid: "kpi-nb-factures" },
          { label: "Total facturé", value: stats ? fmtEur(stats.total) : "—", testid: "kpi-total" },
          { label: "Total versé", value: stats ? fmtEur(stats.total_verse) : "—", accent: true, testid: "kpi-verse" },
          { label: "En attente", value: stats ? fmtEur(stats.total_attente) : "—", warn: (stats?.total_attente || 0) > 0, testid: "kpi-attente" },
        ].map((k) => (
          <Card key={k.label} className="p-4 border-slate-200" data-testid={k.testid}>
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className={`text-2xl font-display font-semibold mt-1 ${k.accent ? "text-brand-700" : k.warn ? "text-amber-600" : "text-slate-900"}`}>
              {k.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Graphique mensuel */}
      <Card className="p-5 border-slate-200 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">Montants versés par mois (date d'émission)</h2>
        <div className="h-56" data-testid="factures-chart">
          {chartData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Receipt size={32} className="mb-2" />
              <p className="text-sm">Importez votre export Factures EDOF pour voir vos encaissements.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k€`} />
                <Tooltip formatter={(v) => fmtEur(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="versé" fill="#0E7FB6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Tableau */}
      <Card className="border-slate-200 overflow-hidden">
        {selected.size > 0 && (
          <div data-testid="factures-bulk-bar" className="px-4 py-2.5 bg-red-50 border-b border-red-200 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-red-900">
              <span className="font-semibold">{selected.size}</span> facture{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}
              <button onClick={clearSelection} className="text-red-600 hover:text-red-800 inline-flex items-center gap-1" data-testid="factures-clear-selection">
                <X size={12} /> désélectionner
              </button>
            </div>
            <Button
              onClick={deleteBulk}
              disabled={deleting}
              data-testid="factures-delete-bulk-btn"
              className="bg-red-600 hover:bg-red-700 text-white h-8"
            >
              <Trash size={14} className="mr-1.5" /> Supprimer la sélection
            </Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="factures-table">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    data-testid="factures-select-all"
                    aria-label="Tout sélectionner"
                    className="h-4 w-4 rounded border-slate-300 cursor-pointer"
                  />
                </th>
                {["N° facture", "N° dossier CPF", "Stagiaire", "Montant", "Statut", "Émise le", "Versée le", "Contrôle"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                ))}
                <th className="px-3 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-sm">Chargement…</td></tr>
              ) : factures.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-sm">Aucune facture — importez votre export EDOF.</td></tr>
              ) : (
                visibleFactures.map((f) => (
                  <tr
                    key={f.id}
                    className={`border-b border-slate-100 transition-colors ${selected.has(f.id) ? "bg-red-50/40" : "hover:bg-slate-50/60"}`}
                    data-testid={`facture-row-${f.numero_facture}`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(f.id)}
                        onChange={() => toggleOne(f.id)}
                        data-testid={`facture-checkbox-${f.id}`}
                        aria-label="Sélectionner la facture"
                        className="h-4 w-4 rounded border-slate-300 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{f.numero_facture || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600 font-mono text-xs whitespace-nowrap">{f.numero_dossier || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {f.apprenant ? (
                        <span className="text-slate-800">{f.apprenant.prenom} {f.apprenant.nom}</span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Non relié — importez l'export Dossiers</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{fmtEur(f.montant)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Badge className={`text-[10px] uppercase tracking-wider ${String(f.statut_reglement).toLowerCase().startsWith("vers") ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {f.statut_reglement}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(f.date_emission)}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(f.date_reglement)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {f.en_controle ? <Badge className="text-[10px] bg-red-50 text-red-700 border-red-200">En contrôle</Badge> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        onClick={() => deleteOne(f)}
                        data-testid={`facture-delete-${f.id}`}
                        className="h-7 w-7 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Supprimer cette facture"
                        aria-label="Supprimer"
                      >
                        <Trash size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && factures.length > 0 && (
          <Pagination total={factures.length} page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} testid="factures-pagination" />
        )}
      </Card>
    </div>
  );
}
