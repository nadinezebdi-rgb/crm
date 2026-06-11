import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, CheckCircle, FloppyDisk } from "@phosphor-icons/react";
import { formatApiError } from "@/lib/api";

const STEPS = [
  { key: "general", label: "Informations générales" },
  { key: "dates", label: "Dates & lieu" },
  { key: "acteurs", label: "Acteurs & programme" },
  { key: "tarifs", label: "Tarifs & conformité" },
];

export default function SessionCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [lieux, setLieux] = useState([]);
  const [entreprises, setEntreprises] = useState([]);
  const [financeurs, setFinanceurs] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [apprenants, setApprenants] = useState([]);

  const [form, setForm] = useState({
    nom: "",
    code_interne: "",
    type_session: "formation_professionnelle",
    type_action: "formation",
    statut: "brouillon",
    formation_interne: false,
    sous_traitance: false,
    retire_catalogue: false,
    fuseau_horaire: "Europe/Paris",
    date_debut: "",
    date_fin: "",
    lieu_id: "",
    lieu_temporaire: "",
    distanciel: false,
    administrateurs: [],
    formateurs: [],
    apprenants: [],
    entreprise_id: "",
    financeur_id: "",
    programme: "",
    categorie: "",
    niveau: "",
    prix_ht: 0,
    cout_ht: 0,
    inclus_bpf: true,
    description: "",
  });

  useEffect(() => {
    (async () => {
      const [l, e, f, fo, ap] = await Promise.all([
        api.get("/lieux"),
        api.get("/entreprises"),
        api.get("/financeurs"),
        api.get("/formateurs"),
        api.get("/apprenants"),
      ]);
      setLieux(l.data);
      setEntreprises(e.data);
      setFinanceurs(f.data);
      setFormateurs(fo.data);
      setApprenants(ap.data);
    })();
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        prix_ht: Number(form.prix_ht || 0),
        cout_ht: Number(form.cout_ht || 0),
        lieu_id: form.lieu_id || null,
        entreprise_id: form.entreprise_id || null,
        financeur_id: form.financeur_id || null,
        date_debut: form.date_debut || null,
        date_fin: form.date_fin || null,
      };
      const { data } = await api.post("/sessions", payload);
      toast.success("Session créée");
      navigate(`/sessions/${data.id}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Création impossible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto" data-testid="session-create-page">
      <header className="mb-7">
        <button onClick={() => navigate("/sessions")} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-2">
          <ArrowLeft size={12} /> Retour aux sessions
        </button>
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Nouvelle session</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 mt-1">Création guidée</h1>
        <p className="text-sm text-slate-500 mt-1">Renseignez les informations essentielles en 4 étapes.</p>
      </header>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar" data-testid="stepper">
        {STEPS.map((s, idx) => (
          <React.Fragment key={s.key}>
            <button
              onClick={() => setStep(idx)}
              className={`flex items-center gap-2 px-3 h-9 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                idx === step
                  ? "bg-slate-900 text-white"
                  : idx < step
                  ? "bg-brand-50 text-brand-700 border border-brand-200"
                  : "bg-white border border-slate-200 text-slate-500"
              }`}
            >
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${idx <= step ? "bg-white/20" : "bg-slate-100"}`}>
                {idx < step ? <CheckCircle size={12} weight="fill" /> : idx + 1}
              </span>
              {s.label}
            </button>
            {idx < STEPS.length - 1 && <div className="flex-1 h-px bg-slate-200 min-w-[10px]" />}
          </React.Fragment>
        ))}
      </div>

      <Card className="p-6 border-slate-200 shadow-none">
        {step === 0 && (
          <div className="space-y-4" data-testid="step-general">
            <FieldRow>
              <Field label="Nom de la session *">
                <Input data-testid="field-nom" value={form.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Ex: Initiation Scrum Master" />
              </Field>
              <Field label="Code interne (auto si vide)">
                <Input data-testid="field-code" value={form.code_interne} onChange={(e) => set("code_interne", e.target.value)} placeholder="SES-2026-XXX" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Type de session">
                <Select value={form.type_session} onValueChange={(v) => set("type_session", v)}>
                  <SelectTrigger data-testid="field-type-session"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formation_professionnelle">Formation professionnelle</SelectItem>
                    <SelectItem value="conseil">Conseil</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Type d'action de formation">
                <Select value={form.type_action} onValueChange={(v) => set("type_action", v)}>
                  <SelectTrigger data-testid="field-type-action"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formation">Action de formation</SelectItem>
                    <SelectItem value="bilan_competences">Bilan de compétences</SelectItem>
                    <SelectItem value="vae">VAE</SelectItem>
                    <SelectItem value="apprentissage">Apprentissage</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Toggle label="Formation interne" checked={form.formation_interne} onChange={(v) => set("formation_interne", v)} testid="field-interne" />
              <Toggle label="Sous-traitée" checked={form.sous_traitance} onChange={(v) => set("sous_traitance", v)} testid="field-soustraite" />
              <Toggle label="Retirée du catalogue" checked={form.retire_catalogue} onChange={(v) => set("retire_catalogue", v)} testid="field-retire" />
            </FieldRow>
            <Field label="Description">
              <Textarea data-testid="field-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Objectifs, public visé, prérequis…" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4" data-testid="step-dates">
            <FieldRow>
              <Field label="Date de début">
                <Input data-testid="field-debut" type="date" value={form.date_debut} onChange={(e) => set("date_debut", e.target.value)} />
              </Field>
              <Field label="Date de fin">
                <Input data-testid="field-fin" type="date" value={form.date_fin} onChange={(e) => set("date_fin", e.target.value)} />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Fuseau horaire">
                <Input value={form.fuseau_horaire} onChange={(e) => set("fuseau_horaire", e.target.value)} />
              </Field>
              <Toggle label="Session en distanciel" checked={form.distanciel} onChange={(v) => set("distanciel", v)} testid="field-distanciel" />
            </FieldRow>
            <Field label="Lieu de formation">
              <Select value={form.lieu_id || "_none"} onValueChange={(v) => set("lieu_id", v === "_none" ? "" : v)}>
                <SelectTrigger data-testid="field-lieu"><SelectValue placeholder="Sélectionner un lieu" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Aucun (distanciel ou à définir)</SelectItem>
                  {lieux.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.nom} {l.ville ? `— ${l.ville}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Lieu temporaire (si non listé)">
              <Input value={form.lieu_temporaire} onChange={(e) => set("lieu_temporaire", e.target.value)} placeholder="Adresse ponctuelle" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4" data-testid="step-acteurs">
            <FieldRow>
              <Field label="Entreprise cliente">
                <Select value={form.entreprise_id || "_none"} onValueChange={(v) => set("entreprise_id", v === "_none" ? "" : v)}>
                  <SelectTrigger data-testid="field-entreprise"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Aucune</SelectItem>
                    {entreprises.map((e) => <SelectItem key={e.id} value={e.id}>{e.raison_sociale}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Financeur">
                <Select value={form.financeur_id || "_none"} onValueChange={(v) => set("financeur_id", v === "_none" ? "" : v)}>
                  <SelectTrigger data-testid="field-financeur"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Aucun</SelectItem>
                    {financeurs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </FieldRow>

            <MultiSelect label="Formateurs" testid="field-formateurs" options={formateurs.map((f) => ({ id: f.id, label: `${f.prenom} ${f.nom}${f.interne ? "" : " (ext.)"}` }))} value={form.formateurs} onChange={(v) => set("formateurs", v)} />
            <MultiSelect label="Apprenants" testid="field-apprenants" options={apprenants.map((a) => ({ id: a.id, label: `${a.prenom} ${a.nom}` }))} value={form.apprenants} onChange={(v) => set("apprenants", v)} />

            <FieldRow>
              <Field label="Programme"><Input data-testid="field-programme" value={form.programme} onChange={(e) => set("programme", e.target.value)} /></Field>
              <Field label="Catégorie"><Input value={form.categorie} onChange={(e) => set("categorie", e.target.value)} /></Field>
              <Field label="Niveau"><Input value={form.niveau} onChange={(e) => set("niveau", e.target.value)} placeholder="Débutant, Avancé…" /></Field>
            </FieldRow>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4" data-testid="step-tarifs">
            <FieldRow>
              <Field label="Prix HT (€)"><Input data-testid="field-prix" type="number" min="0" step="50" value={form.prix_ht} onChange={(e) => set("prix_ht", e.target.value)} /></Field>
              <Field label="Coût HT (€)"><Input data-testid="field-cout" type="number" min="0" step="50" value={form.cout_ht} onChange={(e) => set("cout_ht", e.target.value)} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Statut initial">
                <Select value={form.statut} onValueChange={(v) => set("statut", v)}>
                  <SelectTrigger data-testid="field-statut"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brouillon">Brouillon</SelectItem>
                    <SelectItem value="planification">En planification</SelectItem>
                    <SelectItem value="planifiee">Planifiée</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Toggle label="Inclus dans le BPF (Bilan Pédagogique et Financier)" checked={form.inclus_bpf} onChange={(v) => set("inclus_bpf", v)} testid="field-bpf" />
            </FieldRow>

            <div className="rounded-md border border-brand-200 bg-brand-50 text-brand-900 p-4 text-sm">
              <div className="font-semibold mb-1">Récapitulatif</div>
              <div className="text-xs text-brand-800">
                Session « <span className="font-medium">{form.nom || "Sans nom"}</span> » — Prix HT <span className="font-mono">{Number(form.prix_ht || 0).toLocaleString("fr-FR")} €</span>, Coût HT <span className="font-mono">{Number(form.cout_ht || 0).toLocaleString("fr-FR")} €</span>, marge {form.prix_ht > 0 ? Math.round(((form.prix_ht - form.cout_ht) / form.prix_ht) * 100) : 0}%.
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-7 pt-5 border-t border-slate-100">
          <Button variant="outline" onClick={prev} disabled={step === 0} data-testid="step-prev" className="border-slate-200">
            <ArrowLeft size={14} className="mr-1.5" /> Précédent
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} data-testid="step-next" className="bg-slate-900 hover:bg-slate-800" disabled={step === 0 && !form.nom}>
              Suivant <ArrowRight size={14} className="ml-1.5" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting || !form.nom} data-testid="session-save" className="bg-brand-600 hover:bg-brand-700">
              <FloppyDisk size={14} className="mr-1.5" /> {submitting ? "Création…" : "Créer la session"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function FieldRow({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>;
}
function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function Toggle({ label, checked, onChange, testid }) {
  return (
    <div className="flex items-center justify-between border border-slate-200 rounded-md px-3 h-10 bg-white">
      <span className="text-xs text-slate-700">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testid} />
    </div>
  );
}

function MultiSelect({ label, options, value, onChange, testid }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div>
      <Label className="text-xs font-medium text-slate-700">{label} <span className="text-slate-400 font-normal">({value.length} sélectionné{value.length > 1 ? "s" : ""})</span></Label>
      <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid={testid}>
        {options.length === 0 && <div className="text-xs text-slate-400">Aucune option disponible.</div>}
        {options.map((o) => {
          const selected = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              className={`px-2.5 h-7 rounded-full text-xs font-medium border transition-colors ${
                selected
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-brand-300 hover:text-brand-700"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
