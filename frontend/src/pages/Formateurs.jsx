import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { UserPlus, Users, Pencil, Trash2, Save, X, Loader2 } from "lucide-react";

const empty = { nom: "", prenom: "", email: "", telephone: "", specialite: "" };

function FormateurDialog({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial || empty);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial?.id);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls =
    "h-9 w-full text-sm border border-gray-300 rounded-md px-3 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none bg-white";

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom) {
      toast.error("Nom et prénom requis");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        await api.put(`/formateurs/${initial.id}`, payload);
        toast.success("Formateur mis à jour");
      } else {
        await api.post("/formateurs", payload);
        toast.success("Formateur créé");
      }
      onSaved();
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30" onClick={onClose} data-testid="formateur-dialog">
      <div className="bg-white w-full max-w-lg rounded-lg border border-gray-200 shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "'Manrope', sans-serif" }}>
            {editing ? "Modifier le formateur" : "Nouveau formateur"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="formateur-dialog-close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom *</label>
            <input className={inputCls} value={form.prenom} onChange={(e) => set("prenom", e.target.value)} data-testid="formateur-input-prenom" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nom *</label>
            <input className={inputCls} value={form.nom} onChange={(e) => set("nom", e.target.value)} data-testid="formateur-input-nom" required />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
            <input type="email" className={inputCls} value={form.email || ""} onChange={(e) => set("email", e.target.value)} data-testid="formateur-input-email" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Téléphone</label>
            <input className={inputCls} value={form.telephone || ""} onChange={(e) => set("telephone", e.target.value)} data-testid="formateur-input-telephone" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Spécialité</label>
            <input className={inputCls} value={form.specialite || ""} onChange={(e) => set("specialite", e.target.value)} data-testid="formateur-input-specialite" />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              Annuler
            </button>
            <button type="submit" disabled={saving} data-testid="formateur-submit"
              className="h-9 px-5 text-sm font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 inline-flex items-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Formateurs() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/formateurs");
      setItems(data);
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (f) => {
    if (!window.confirm(`Supprimer ${f.prenom} ${f.nom} ?`)) return;
    try {
      await api.delete(`/formateurs/${f.id}`);
      toast.success("Formateur supprimé");
      load();
    } catch {
      toast.error("Erreur");
    }
  };

  return (
    <>
      <PageHeader
        title="Formateurs"
        subtitle="Gestion de l'équipe pédagogique"
        testid="formateurs-header"
        actions={
          <button
            onClick={() => { setEditing(null); setShowDialog(true); }}
            data-testid="add-formateur-btn"
            className="h-9 px-4 text-sm font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 inline-flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" /> Ajouter
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center text-slate-400 py-20">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Chargement…
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-slate-400 py-16 text-sm bg-white rounded-lg border border-dashed border-slate-200">
              <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              Aucun formateur enregistré
              <div className="text-xs mt-1">Commencez par ajouter votre premier formateur</div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-gray-200">
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="text-left px-4 py-3 font-semibold">Nom</th>
                    <th className="text-left px-4 py-3 font-semibold">Email</th>
                    <th className="text-left px-4 py-3 font-semibold">Téléphone</th>
                    <th className="text-left px-4 py-3 font-semibold">Spécialité</th>
                    <th className="w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => (
                    <tr key={f.id} data-testid={`formateur-row-${f.id}`} className="border-b border-gray-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{f.prenom} {f.nom}</td>
                      <td className="px-4 py-3 text-slate-700">{f.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{f.telephone || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{f.specialite || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditing(f); setShowDialog(true); }}
                            data-testid={`edit-formateur-${f.id}`}
                            className="h-7 w-7 inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => remove(f)}
                            data-testid={`delete-formateur-${f.id}`}
                            className="h-7 w-7 inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {showDialog ? (
        <FormateurDialog
          initial={editing}
          onClose={() => setShowDialog(false)}
          onSaved={() => { setShowDialog(false); load(); }}
        />
      ) : null}
    </>
  );
}
