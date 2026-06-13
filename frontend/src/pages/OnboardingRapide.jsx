import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { FINANCEUR_TYPES } from "@/lib/dossiers";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { UserPlus, FloppyDisk, Spinner } from "@phosphor-icons/react";

const empty = {
  nom: "",
  prenom: "",
  date_naissance: "",
  adresse: "",
  email: "",
  telephone: "",
  formateur_id: "",
  financeur_type: "OPCO",
  financeur_nom: "",
  formation: "",
  notes: "",
};

export default function Onboarding() {
  const [form, setForm] = useState(empty);
  const [formateurs, setFormateurs] = useState([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/formateurs").then(({ data }) => setFormateurs(data)).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom) {
      toast.error("Nom et prénom sont requis");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.formateur_id) payload.formateur_id = null;
      if (!payload.date_naissance) delete payload.date_naissance;
      await api.post("/dossiers", payload);
      toast.success(`Dossier de ${form.prenom} ${form.nom} créé`);
      setForm(empty);
      navigate("/kanban");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "h-9 w-full text-sm border border-slate-300 rounded-md px-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white text-slate-900 placeholder:text-slate-400";
  const labelCls = "block text-xs font-semibold text-slate-700 mb-1";

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="px-8 py-5 border-b border-slate-200 bg-white">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 font-display">Onboarding stagiaire</h1>
        <p className="text-xs text-slate-500 mt-1">Création rapide d'un nouveau dossier — entrée individuelle</p>
      </div>

      <div className="p-8 bg-slate-50">
        <form
          onSubmit={submit}
          data-testid="onboarding-form"
          className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-lg shadow-sm p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-md bg-navy text-white flex items-center justify-center">
              <UserPlus size={18} weight="bold" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 font-display">Nouveau stagiaire</div>
              <div className="text-xs text-slate-500">Remplissez les informations en quelques secondes</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Nom *</label>
              <input data-testid="onboarding-input-nom" className={inputCls} value={form.nom} onChange={(e) => set("nom", e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Prénom *</label>
              <input data-testid="onboarding-input-prenom" className={inputCls} value={form.prenom} onChange={(e) => set("prenom", e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Date de naissance</label>
              <input data-testid="onboarding-input-naissance" type="date" className={inputCls} value={form.date_naissance} onChange={(e) => set("date_naissance", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Téléphone</label>
              <input data-testid="onboarding-input-telephone" className={inputCls} value={form.telephone} onChange={(e) => set("telephone", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Adresse</label>
              <input data-testid="onboarding-input-adresse" className={inputCls} value={form.adresse} onChange={(e) => set("adresse", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Adresse mail</label>
              <input data-testid="onboarding-input-email" type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Formateur attribué</label>
              <select data-testid="onboarding-select-formateur" className={inputCls} value={form.formateur_id} onChange={(e) => set("formateur_id", e.target.value)}>
                <option value="">— Sélectionner —</option>
                {formateurs.map((f) => (
                  <option key={f.id} value={f.id}>{f.prenom} {f.nom}</option>
                ))}
              </select>
              {formateurs.length === 0 ? (
                <div className="text-[11px] text-amber-600 mt-1">
                  Aucun formateur. Ajoutez-en depuis l&apos;onglet « Formateurs ».
                </div>
              ) : null}
            </div>
            <div>
              <label className={labelCls}>Type de financeur *</label>
              <select data-testid="onboarding-select-financeur" className={inputCls} value={form.financeur_type} onChange={(e) => set("financeur_type", e.target.value)}>
                {FINANCEUR_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {form.financeur_type === "OPCO" ? "Nom de l'OPCO" : form.financeur_type === "CPF" ? "Référence CPF" : "Nom du client privé"}
              </label>
              <input data-testid="onboarding-input-financeur-nom" className={inputCls} value={form.financeur_nom} onChange={(e) => set("financeur_nom", e.target.value)} placeholder={form.financeur_type === "OPCO" ? "Ex: Atlas, Akto…" : ""} />
            </div>
            <div>
              <label className={labelCls}>Intitulé formation</label>
              <input data-testid="onboarding-input-formation" className={inputCls} value={form.formation} onChange={(e) => set("formation", e.target.value)} placeholder="Ex: Anglais B1" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Notes (optionnel)</label>
              <textarea data-testid="onboarding-input-notes" rows={2} className={`${inputCls} h-auto py-2 resize-none`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-slate-100">
            <button type="button" onClick={() => setForm(empty)} data-testid="onboarding-reset"
              className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
              Réinitialiser
            </button>
            <button type="submit" disabled={saving} data-testid="onboarding-submit"
              className="h-9 px-5 text-sm font-semibold text-white bg-navy rounded-md hover:bg-navy/90 transition-colors inline-flex items-center gap-2 disabled:opacity-60">
              {saving ? <Spinner size={14} className="animate-spin" /> : <FloppyDisk size={14} weight="bold" />} Créer le dossier
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
