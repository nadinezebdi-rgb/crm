import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  ChalkboardTeacher,
  Buildings,
  TrendUp,
  CheckCircle,
  Clock,
  CurrencyEur,
  CalendarBlank,
  ArrowUpRight,
  Kanban,
  Plus,
} from "@phosphor-icons/react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const STATUS_META = {
  brouillon: { label: "Brouillons", color: "#94A3B8" },
  planification: { label: "En planification", color: "#F59E0B" },
  planifiee: { label: "Planifiées", color: "#2563EB" },
  terminee: { label: "Terminées", color: "#10B981" },
  archivee: { label: "Archivées", color: "#64748B" },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: s }, { data: c }] = await Promise.all([api.get("/dashboard/stats"), api.get("/dashboard/calendar")]);
        setStats(s);
        setCalendar(c);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-8 text-slate-500" data-testid="dashboard-loading">Chargement…</div>;
  if (!stats) return null;

  const chartData = Object.entries(stats.by_status).map(([k, v]) => ({ name: STATUS_META[k]?.label || k, value: v, fill: STATUS_META[k]?.color }));

  return (
    <div className="p-6 lg:p-8 space-y-7" data-testid="dashboard-page">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Accueil</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 mt-1">Tableau de bord</h1>
          <p className="text-sm text-slate-500 mt-1">Synthèse de votre activité de formation en temps réel.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/sessions">
            <Button variant="outline" data-testid="goto-sessions-btn" className="border-slate-200">
              <Kanban size={16} className="mr-1.5" /> Voir les sessions
            </Button>
          </Link>
          <Link to="/sessions/new">
            <Button data-testid="create-session-btn" className="bg-brand-600 hover:bg-brand-700">
              <Plus size={16} className="mr-1.5" /> Nouvelle session
            </Button>
          </Link>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Kanban} label="Sessions actives" value={stats.sessions_actives} hint={`${stats.total_sessions} au total`} accent="blue" testid="kpi-sessions" />
        <Kpi icon={Users} label="Apprenants" value={stats.total_apprenants} hint="Dans le référentiel" accent="slate" testid="kpi-apprenants" />
        <Kpi icon={CurrencyEur} label="CA réalisé" value={`${stats.ca.toLocaleString("fr-FR")} €`} hint={stats.ca_cpf > 0 ? `dont ${stats.ca_cpf.toLocaleString("fr-FR")} € CPF encaissés` : `Marge ${stats.taux_marge}%`} accent="emerald" testid="kpi-ca" />
        <Kpi icon={TrendUp} label="Progression moyenne" value={`${stats.avg_progression}%`} hint="Sessions actives" accent="amber" testid="kpi-progression" progress={stats.avg_progression} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart */}
        <Card className="lg:col-span-2 p-6 border-slate-200 shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Sessions par statut</div>
              <div className="font-display text-lg font-medium text-slate-900 mt-0.5">Répartition Kanban</div>
            </div>
            <Link to="/sessions" className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1">
              Ouvrir <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }}
                  cursor={{ fill: "rgba(37, 99, 235, 0.05)" }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Side: extra KPIs */}
        <Card className="p-6 border-slate-200 shadow-none space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Réseau</div>
            <div className="font-display text-lg font-medium text-slate-900 mt-0.5">Acteurs référencés</div>
          </div>
          <div className="space-y-3">
            <MiniStat icon={ChalkboardTeacher} label="Formateurs" value={stats.total_formateurs} />
            <MiniStat icon={Buildings} label="Entreprises clientes" value={stats.total_entreprises} />
            <MiniStat icon={CheckCircle} label="Sessions terminées" value={stats.sessions_terminees} />
            <MiniStat icon={Clock} label="Total sessions" value={stats.total_sessions} />
          </div>
        </Card>
      </div>

      {/* Calendar list */}
      <Card className="p-6 border-slate-200 shadow-none" data-testid="calendar-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Calendrier</div>
            <div className="font-display text-lg font-medium text-slate-900 mt-0.5">Sessions programmées</div>
          </div>
          <Link to="/sessions" className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1">
            Vue Kanban <ArrowUpRight size={12} />
          </Link>
        </div>
        {calendar.length === 0 ? (
          <div className="text-sm text-slate-500 py-10 text-center border border-dashed border-slate-200 rounded-md">
            Aucune session planifiée — créez-en une depuis le module Sessions.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {calendar.map((s) => (
              <Link
                key={s.id}
                to={`/sessions/${s.id}`}
                className="flex items-center gap-4 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-md transition-colors"
                data-testid={`calendar-item-${s.id}`}
              >
                <div className="w-12 h-12 rounded-md bg-brand-50 text-brand-700 flex flex-col items-center justify-center flex-shrink-0">
                  <CalendarBlank size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{s.nom}</div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span className="font-mono">{s.code_interne}</span>
                    <span>•</span>
                    <span>{s.date_debut} → {s.date_fin}</span>
                    {s.distanciel && <Badge variant="outline" className="ml-1 h-4 px-1.5 text-[10px] border-brand-200 text-brand-700 bg-brand-50">Distanciel</Badge>}
                  </div>
                </div>
                <Badge className={`text-[10px] uppercase tracking-wider font-medium ${statusBadgeClass(s.statut)}`}>
                  {STATUS_META[s.statut]?.label}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, accent, testid, progress }) {
  const accentMap = {
    blue: "bg-brand-50 text-brand-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <Card className="p-5 border-slate-200 shadow-none" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</div>
          <div className="font-display text-2xl font-semibold text-slate-900 mt-2">{value}</div>
          {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
        </div>
        <div className={`h-9 w-9 rounded-md flex items-center justify-center ${accentMap[accent] || accentMap.slate}`}>
          <Icon size={18} weight="duotone" />
        </div>
      </div>
      {typeof progress === "number" && (
        <div className="mt-3">
          <Progress value={progress} className="h-1.5" />
        </div>
      )}
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2.5 text-sm text-slate-600">
        <Icon size={16} className="text-slate-400" />
        {label}
      </div>
      <div className="font-mono font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export function statusBadgeClass(statut) {
  const map = {
    brouillon: "bg-slate-100 text-slate-700 border-slate-200",
    planification: "bg-amber-50 text-amber-700 border-amber-200",
    planifiee: "bg-brand-50 text-brand-700 border-brand-200",
    terminee: "bg-emerald-50 text-emerald-700 border-emerald-200",
    archivee: "bg-neutral-100 text-neutral-600 border-neutral-200",
  };
  return map[statut] || map.brouillon;
}
