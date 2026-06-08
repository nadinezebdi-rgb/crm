import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, MagnifyingGlass, Trash, PencilSimple } from "@phosphor-icons/react";

/**
 * Generic CRUD page used by Apprenants/Formateurs/etc.
 * Props:
 *  - title, subtitle, endpoint, columns, fields, blank, badges?
 */
export default function CrudPage({ title, subtitle, endpoint, columns, fields, blank, badges, testid }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/${endpoint}`, { params: search ? { q: search } : {} });
      setItems(data);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) load(); }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const startCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const startEdit = (item) => { setEditing(item); setForm({ ...blank, ...item }); setOpen(true); };

  const save = async () => {
    try {
      const payload = { ...form };
      // Filter empty strings that should be null
      Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
      if (editing) {
        await api.put(`/${endpoint}/${editing.id}`, payload);
        toast.success("Mis à jour");
      } else {
        await api.post(`/${endpoint}`, payload);
        toast.success("Créé");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Supprimer cet élément ?`)) return;
    try {
      await api.delete(`/${endpoint}/${item.id}`);
      toast.success("Supprimé");
      load();
    } catch (e) { toast.error("Échec"); }
  };

  return (
    <div className="p-6 lg:p-8" data-testid={testid}>
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-blue-700">Données</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 mt-1">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-9 w-64 bg-white" data-testid={`${testid}-search`} />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={startCreate} data-testid={`${testid}-new-btn`}>
                <Plus size={16} className="mr-1.5" /> Nouveau
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-display">{editing ? "Modifier" : "Créer"} — {title.slice(0, -1)}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
                {fields.map((f) => (
                  <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
                    <Label className="text-xs font-medium text-slate-700">{f.label}</Label>
                    {f.type === "textarea" ? (
                      <textarea
                        rows={3}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      />
                    ) : f.type === "checkbox" ? (
                      <div className="mt-1 flex items-center gap-2 h-10 px-3 border border-slate-200 rounded-md">
                        <input
                          type="checkbox"
                          checked={!!form[f.key]}
                          onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                          data-testid={`${testid}-field-${f.key}`}
                        />
                        <span className="text-xs text-slate-600">{f.hint || "Activer"}</span>
                      </div>
                    ) : f.type === "number" ? (
                      <Input
                        type="number"
                        className="mt-1"
                        value={form[f.key] ?? 0}
                        onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
                        data-testid={`${testid}-field-${f.key}`}
                      />
                    ) : f.type === "select" ? (
                      <select
                        className="mt-1 w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        data-testid={`${testid}-field-${f.key}`}
                      >
                        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <Input
                        type={f.type || "text"}
                        className="mt-1"
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        data-testid={`${testid}-field-${f.key}`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-200">Annuler</Button>
                <Button onClick={save} className="bg-blue-600 hover:bg-blue-700" data-testid={`${testid}-save-btn`}>
                  {editing ? "Mettre à jour" : "Créer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="border-slate-200 shadow-none overflow-hidden">
        <div className={`grid text-[10px] uppercase tracking-widest text-slate-500 font-semibold px-5 py-2.5 border-b border-slate-100 bg-slate-50`} style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr) 80px` }}>
          {columns.map((c) => <div key={c.key}>{c.label}</div>)}
          <div className="text-right">Actions</div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">Aucun élément. Cliquez sur « Nouveau » pour commencer.</div>
        ) : items.map((it) => (
          <div key={it.id} className="grid items-center px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors text-sm" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr) 80px` }} data-testid={`${testid}-row-${it.id}`}>
            {columns.map((c) => (
              <div key={c.key} className="truncate pr-2 text-slate-700">
                {c.render ? c.render(it) : (it[c.key] ?? "—")}
                {c.badge && it[c.badge.key] && <Badge variant="outline" className={`ml-1.5 text-[9px] h-4 px-1.5 ${c.badge.className}`}>{c.badge.label}</Badge>}
              </div>
            ))}
            <div className="flex items-center justify-end gap-1">
              <button onClick={() => startEdit(it)} className="h-7 w-7 rounded hover:bg-slate-100 text-slate-500 flex items-center justify-center" data-testid={`${testid}-edit-${it.id}`}>
                <PencilSimple size={14} />
              </button>
              <button onClick={() => remove(it)} className="h-7 w-7 rounded hover:bg-red-50 text-red-600 flex items-center justify-center" data-testid={`${testid}-delete-${it.id}`}>
                <Trash size={14} />
              </button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
