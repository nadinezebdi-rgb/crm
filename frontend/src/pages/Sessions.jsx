import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  MagnifyingGlass,
  ListBullets,
  Kanban as KanbanIcon,
  MapPin,
  Users,
  ChalkboardTeacher,
  CurrencyEur,
  Trash,
} from "@phosphor-icons/react";
import { statusBadgeClass } from "./Dashboard";

const COLUMNS = [
  { key: "brouillon", label: "Brouillons", description: "À compléter" },
  { key: "planification", label: "En planification", description: "Préparation" },
  { key: "planifiee", label: "Planifiées", description: "Programmées" },
  { key: "terminee", label: "Terminées", description: "Clôturées" },
  { key: "archivee", label: "Archivées", description: "Historique" },
];

export default function Sessions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("kanban");
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [filterAction, setFilterAction] = useState("all");
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.q = search;
      if (filterAction !== "all") params.type_action = filterAction;
      const { data } = await api.get("/sessions", { params });
      setSessions(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) load();
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, filterAction]);

  const byColumn = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((c) => [c.key, []]));
    sessions.forEach((s) => { if (map[s.statut]) map[s.statut].push(s); });
    return map;
  }, [sessions]);

  const updateStatus = async (sessionId, statut) => {
    try {
      await api.patch(`/sessions/${sessionId}/statut`, { statut });
      toast.success("Statut mis à jour");
      load();
    } catch (e) {
      toast.error("Mise à jour impossible");
    }
  };

  const deleteSession = async (session) => {
    if (!window.confirm(`Supprimer définitivement la session « ${session.nom} » ?\n\nCette action est irréversible. Les documents générés pour cette session resteront classés dans les fiches des stagiaires.`)) return;
    try {
      await api.delete(`/sessions/${session.id}`);
      toast.success("Session supprimée");
      load();
    } catch (e) {
      toast.error("Suppression impossible");
    }
  };

  const deleteSessionsCpf = async () => {
    const cpfSessions = sessions.filter((s) => (s.code_interne || "").startsWith("CPF-"));
    if (cpfSessions.length === 0) {
      toast.info("Aucune session CPF auto-générée à supprimer");
      return;
    }
    if (!window.confirm(`Supprimer ${cpfSessions.length} session(s) auto-générée(s) depuis les factures CPF ?\n\nVous pourrez les régénérer à tout moment depuis la page Facturation CPF.`)) return;
    try {
      await Promise.all(cpfSessions.map((s) => api.delete(`/sessions/${s.id}`)));
      toast.success(`${cpfSessions.length} session(s) CPF supprimée(s)`);
      load();
    } catch (e) {
      toast.error("Suppression impossible");
    }
  };

  return (
    <div className="p-6 lg:p-8" data-testid="sessions-page">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Sessions de formation</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 mt-1">Pilotage des sessions</h1>
          <p className="text-sm text-slate-500 mt-1">{sessions.length} sessions • Glissez vos sessions entre les colonnes pour mettre à jour leur statut.</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-white border border-slate-200 rounded-md flex p-0.5">
            <button
              data-testid="view-kanban-btn"
              onClick={() => setView("kanban")}
              className={`h-8 px-3 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${view === "kanban" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <KanbanIcon size={14} /> Kanban
            </button>
            <button
              data-testid="view-list-btn"
              onClick={() => setView("list")}
              className={`h-8 px-3 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${view === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <ListBullets size={14} /> Liste
            </button>
          </div>
          {sessions.some((s) => (s.code_interne || "").startsWith("CPF-")) && (
            <Button
              variant="outline"
              onClick={deleteSessionsCpf}
              data-testid="delete-sessions-cpf-btn"
              className="border-red-200 text-red-700 hover:bg-red-50"
              title="Supprime toutes les sessions générées automatiquement depuis la facturation CPF"
            >
              <Trash size={14} className="mr-1.5" /> Vider sessions CPF
            </Button>
          )}
          <Button onClick={() => navigate("/sessions/new")} data-testid="new-session-btn" className="bg-brand-600 hover:bg-brand-700">
            <Plus size={16} className="mr-1.5" /> Nouvelle session
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="sessions-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, code interne…"
            className="pl-9 bg-white"
          />
        </div>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger data-testid="filter-action" className="w-56 bg-white">
            <SelectValue placeholder="Type d'action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les actions</SelectItem>
            <SelectItem value="formation">Action de formation</SelectItem>
            <SelectItem value="bilan_competences">Bilan de compétences</SelectItem>
            <SelectItem value="vae">VAE</SelectItem>
            <SelectItem value="apprentissage">Apprentissage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Chargement des sessions…</div>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4" data-testid="kanban-board">
          {COLUMNS.map((col) => (
            <div key={col.key} className="bg-slate-50/60 border border-slate-200 rounded-lg p-3" data-testid={`column-${col.key}`}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-600">{col.label}</div>
                  <div className="text-[10px] text-slate-400">{col.description}</div>
                </div>
                <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 font-mono">
                  {byColumn[col.key].length}
                </Badge>
              </div>
              <div className="space-y-2.5">
                {byColumn[col.key].map((s) => (
                  <SessionCard key={s.id} session={s} onMove={updateStatus} onDelete={deleteSession} />
                ))}
                {byColumn[col.key].length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-md">Vide</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="border-slate-200 shadow-none overflow-hidden" data-testid="sessions-list">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-slate-500 font-semibold px-5 py-2.5 border-b border-slate-100 bg-slate-50">
            <div className="col-span-5">Session</div>
            <div className="col-span-2">Statut</div>
            <div className="col-span-2">Dates</div>
            <div className="col-span-2">Progression</div>
            <div className="col-span-1 text-right">CA</div>
          </div>
          {sessions.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-12 items-center px-5 py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group"
              data-testid={`row-${s.id}`}
            >
              <Link to={`/sessions/${s.id}`} className="col-span-5 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{s.nom}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">{s.code_interne}</div>
              </Link>
              <Link to={`/sessions/${s.id}`} className="col-span-2">
                <Badge className={`text-[10px] uppercase tracking-wider ${statusBadgeClass(s.statut)}`}>
                  {COLUMNS.find((c) => c.key === s.statut)?.label}
                </Badge>
              </Link>
              <Link to={`/sessions/${s.id}`} className="col-span-2 text-xs text-slate-600">{s.date_debut || "—"} → {s.date_fin || "—"}</Link>
              <Link to={`/sessions/${s.id}`} className="col-span-2 flex items-center gap-2">
                <Progress value={s.progression.percent} className="h-1.5 flex-1" />
                <span className="text-[11px] text-slate-500 font-mono">{s.progression.percent}%</span>
              </Link>
              <div className="col-span-1 flex items-center justify-end gap-2">
                <Link to={`/sessions/${s.id}`} className="font-mono text-sm font-semibold text-slate-900">{(s.ca || 0).toLocaleString("fr-FR")}€</Link>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteSession(s); }}
                  className="h-7 w-7 rounded hover:bg-red-50 text-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`session-delete-${s.id}`}
                  title="Supprimer la session"
                >
                  <Trash size={14} />
                </button>
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-500">Aucune session trouvée.</div>
          )}
        </Card>
      )}
    </div>
  );
}

function SessionCard({ session, onMove, onDelete }) {
  return (
    <Link to={`/sessions/${session.id}`} className="block group relative" data-testid={`card-${session.id}`}>
      <Card className="kanban-card border-slate-200 bg-white shadow-none p-3.5 cursor-pointer">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(session); }}
          className="absolute top-2 right-2 h-6 w-6 rounded hover:bg-red-50 text-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-slate-200"
          data-testid={`card-delete-${session.id}`}
          title="Supprimer la session"
        >
          <Trash size={12} />
        </button>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">{session.code_interne}</div>
            <div className="text-sm font-medium text-slate-900 mt-1 line-clamp-2">{session.nom}</div>
          </div>
          {session.distanciel && (
            <Badge variant="outline" className="border-brand-200 text-brand-700 bg-brand-50 text-[10px] h-5 px-1.5">
              Distanciel
            </Badge>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
          {session.date_debut && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} /> {session.date_debut} → {session.date_fin}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><ChalkboardTeacher size={12} /> {session.formateurs?.length || 0}</span>
          <span className="inline-flex items-center gap-1"><Users size={12} /> {session.apprenants?.length || 0}</span>
          <span className="inline-flex items-center gap-1 ml-auto font-mono font-medium text-slate-700"><CurrencyEur size={12} /> {(session.ca || 0).toLocaleString("fr-FR")}</span>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] mb-1 text-slate-500">
            <span>Progression Qualiopi</span>
            <span className="font-mono font-semibold text-slate-700">{session.progression.percent}%</span>
          </div>
          <Progress value={session.progression.percent} className="h-1.5" />
        </div>
      </Card>
    </Link>
  );
}
