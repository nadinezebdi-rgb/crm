import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  House,
  ChartBar,
  Kanban,
  Users,
  ChalkboardTeacher,
  Buildings,
  Bank,
  MapPin,
  Gear,
  MagnifyingGlass,
  Bell,
  SignOut,
  CaretRight,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/dashboard", label: "Accueil", icon: House, testid: "nav-dashboard" },
  { to: "/sessions", label: "Sessions", icon: Kanban, testid: "nav-sessions" },
  { to: "/apprenants", label: "Apprenants", icon: Users, testid: "nav-apprenants" },
  { to: "/formateurs", label: "Formateurs", icon: ChalkboardTeacher, testid: "nav-formateurs" },
  { to: "/entreprises", label: "Entreprises", icon: Buildings, testid: "nav-entreprises" },
  { to: "/financeurs", label: "Financeurs", icon: Bank, testid: "nav-financeurs" },
  { to: "/lieux", label: "Lieux", icon: MapPin, testid: "nav-lieux" },
  { to: "/parametres", label: "Paramètres", icon: Gear, testid: "nav-parametres" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  return (
    <div className="min-h-screen flex bg-[rgb(var(--bg))]" data-testid="app-layout">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-slate-200 bg-white" data-testid="sidebar">
        <div className="h-16 px-5 flex items-center border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[rgb(var(--brand))] flex items-center justify-center text-white font-display font-semibold">
              <ChartBar size={20} weight="duotone" />
            </div>
            <div>
              <div className="font-display font-semibold text-slate-900 tracking-tight">FormaPro</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Édition Pro</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-0.5">
          <div className="px-3 pb-2 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Pilotage</div>
          {NAV.slice(0, 2).map((item) => (
            <SidebarItem key={item.to} {...item} />
          ))}
          <div className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Données</div>
          {NAV.slice(2, 7).map((item) => (
            <SidebarItem key={item.to} {...item} />
          ))}
          <div className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Config</div>
          {NAV.slice(7).map((item) => (
            <SidebarItem key={item.to} {...item} />
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
            <div className="font-semibold text-slate-700 mb-1">Conformité Qualiopi</div>
            <div className="text-slate-500 leading-relaxed">Audit prêt en quelques clics depuis chaque session.</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 px-4 md:px-8 flex items-center gap-3" data-testid="topbar">
          <div className="flex-1 max-w-xl relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              data-testid="global-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) navigate(`/sessions?q=${encodeURIComponent(search)}`);
              }}
              placeholder="Rechercher une session, un apprenant, une entreprise…"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
          <button
            className="relative h-9 w-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
            data-testid="notifications-btn"
          >
            <Bell size={18} weight="regular" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2.5 h-9 pl-1.5 pr-3 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
                data-testid="user-menu-trigger"
              >
                <div className="h-7 w-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center overflow-hidden">
                  {user?.picture ? (
                    <img src={user.picture} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    (user?.name || user?.email || "?").substring(0, 2).toUpperCase()
                  )}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-slate-900 leading-tight">{user?.name || user?.email}</div>
                  <div className="text-[10px] text-slate-500 leading-tight">{user?.organisme}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="text-xs font-semibold text-slate-900">{user?.name}</div>
                <div className="text-[11px] text-slate-500 font-normal">{user?.email}</div>
                <div className="text-[10px] mt-1 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 uppercase tracking-wider font-semibold">
                  {user?.role}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/parametres")} data-testid="menu-parametres">
                <Gear size={14} className="mr-2" /> Paramètres
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout} data-testid="logout-btn" className="text-red-600 focus:text-red-700">
                <SignOut size={14} className="mr-2" /> Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarItem({ to, label, icon: Icon, testid }) {
  return (
    <NavLink
      to={to}
      data-testid={testid}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 h-9 rounded-md text-sm transition-colors ${
          isActive
            ? "bg-blue-50 text-blue-700 font-medium"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} weight={isActive ? "fill" : "regular"} />
          <span className="flex-1">{label}</span>
          {isActive && <CaretRight size={12} className="text-blue-600" />}
        </>
      )}
    </NavLink>
  );
}
