import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, UserPlus, GraduationCap, Archive, Users, GanttChart } from "lucide-react";

const navActive = [
  { to: "/", label: "Tableau de Bord", icon: LayoutDashboard, testid: "sidebar-nav-dashboard" },
  { to: "/onboarding", label: "Onboarding", icon: UserPlus, testid: "sidebar-nav-onboarding" },
  { to: "/actions", label: "Actions de Formation", icon: GraduationCap, testid: "sidebar-nav-actions" },
];

const navAdmin = [
  { to: "/formateurs", label: "Formateurs", icon: Users, testid: "sidebar-nav-formateurs" },
];

const navHistory = [
  { to: "/archives", label: "Dossiers Clôturés", icon: Archive, testid: "sidebar-nav-archives" },
];

function NavItem({ to, label, icon: Icon, testid }) {
  return (
    <NavLink
      end={to === "/"}
      to={to}
      data-testid={testid}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "bg-slate-900 text-white shadow-sm"
            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        }`
      }
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function ZoneLabel({ children }) {
  return (
    <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
      {children}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <aside
        data-testid="app-sidebar"
        className="w-64 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white"
      >
        <div className="h-16 flex items-center px-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-slate-900 flex items-center justify-center text-white">
              <GanttChart className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight text-slate-900" style={{ fontFamily: "'Manrope', sans-serif" }}>
                CRM Formation
              </div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Pilotage</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          <div>
            <ZoneLabel>Espace Actif</ZoneLabel>
            <div className="space-y-1">
              {navActive.map((n) => (
                <NavItem key={n.to} {...n} />
              ))}
            </div>
          </div>

          <div>
            <ZoneLabel>Administration</ZoneLabel>
            <div className="space-y-1">
              {navAdmin.map((n) => (
                <NavItem key={n.to} {...n} />
              ))}
            </div>
          </div>

          <div>
            <ZoneLabel>Espace Historique</ZoneLabel>
            <div className="space-y-1">
              {navHistory.map((n) => (
                <NavItem key={n.to} {...n} />
              ))}
            </div>
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-gray-200 text-[11px] text-slate-400">
          v1.0 · {new Date().getFullYear()}
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
