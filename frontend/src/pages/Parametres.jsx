import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Buildings,
  Palette,
  Plug,
  EnvelopeSimple,
  FileText,
  ShieldCheck,
  Bell,
  WheelchairMotion,
  Detective,
  CheckCircle,
  Warning,
  ArrowsMerge,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";

function Section({ icon: Icon, title, description, children, mocked }) {
  return (
    <Card className="p-6 border-slate-200 shadow-none">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center">
          <Icon size={20} weight="duotone" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-slate-900">{title}</h3>
            {mocked && (
              <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-amber-200 bg-amber-50 text-amber-700">
                À venir
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </Card>
  );
}

const ORG_FIELDS = [
  { key: "nom", label: "Nom de l'organisme", full: true },
  { key: "forme_juridique", label: "Forme juridique" },
  { key: "siret", label: "SIRET" },
  { key: "rcs", label: "RCS" },
  { key: "tva", label: "N° TVA intracommunautaire" },
  { key: "code_ape", label: "Code APE" },
  { key: "nda", label: "N° de déclaration d'activité (NDA)" },
  { key: "nda_region", label: "Région d'enregistrement NDA" },
  { key: "qualiopi_numero", label: "N° Qualiopi" },
  { key: "qualiopi_certificateur", label: "Certificateur Qualiopi" },
  { key: "adresse", label: "Adresse", full: true },
  { key: "code_postal", label: "Code postal" },
  { key: "ville", label: "Ville" },
  { key: "email", label: "Email" },
  { key: "telephone", label: "Téléphone" },
  { key: "site_web", label: "Site web", full: true },
];

function OrganismeIdentite() {
  const [org, setOrg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/parametres/organisme").then(({ data }) => setOrg(data)).catch(() => toast.error("Impossible de charger les infos de l'organisme"));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/parametres/organisme", org);
      setOrg(data);
      toast.success("Informations de l'organisme enregistrées");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  if (!org) return <div className="text-xs text-slate-400">Chargement…</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {ORG_FIELDS.map((f) => (
          <div key={f.key} className={f.full ? "col-span-2" : ""}>
            <Label className="text-xs font-medium text-slate-700">{f.label}</Label>
            <Input
              className="mt-1"
              data-testid={`org-${f.key}`}
              value={org[f.key] || ""}
              onChange={(e) => setOrg({ ...org, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        Ces informations figurent automatiquement sur tous les documents PDF générés (conventions, attestations, factures…).
      </p>
      <Button onClick={save} disabled={saving} data-testid="org-save-btn" className="bg-brand-600 hover:bg-brand-700">
        {saving ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </div>
  );
}

function QualiteDonnees() {
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fusing, setFusing] = useState(null);

  const analyser = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/qualite/doublons");
      setRes(data);
    } catch {
      toast.error("Analyse impossible");
    } finally {
      setLoading(false);
    }
  };

  const fusionner = async (groupe) => {
    const ids = groupe.apprenants.map((a) => a.id);
    if (!window.confirm(`Fusionner ces ${ids.length} fiches en une seule ? Les sessions, documents et n° de dossier CPF seront conservés sur la fiche la plus ancienne.`)) return;
    setFusing(groupe.cle);
    try {
      const { data } = await api.post("/apprenants/fusionner", { apprenant_ids: ids });
      toast.success(`Fusion réussie : ${data.fiches_fusionnees} fiche(s) fusionnée(s), ${data.sessions_reaffectees} session(s) et ${data.documents_reaffectes} document(s) réaffectés`);
      analyser();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Fusion impossible");
    } finally {
      setFusing(null);
    }
  };

  const nbProblemes = res
    ? res.apprenants_par_email.length + res.apprenants_par_nom.length + res.factures_par_numero.length
    : 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Recherche les apprenants en double (même email ou même nom + prénom) et les factures CPF en double (même n° de facture).
      </p>
      <Button onClick={analyser} disabled={loading} data-testid="doublons-analyse-btn" className="bg-brand-600 hover:bg-brand-700">
        <Detective size={16} className="mr-1.5" /> {loading ? "Analyse…" : "Analyser les doublons"}
      </Button>

      {res && (
        <div className="space-y-3" data-testid="doublons-result">
          <div className="text-xs text-slate-600">
            {res.total_apprenants} apprenant(s) et {res.total_factures} facture(s) analysés.
          </div>
          {nbProblemes === 0 ? (
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium" data-testid="doublons-aucun">
              <CheckCircle size={16} weight="fill" /> Aucun doublon détecté — vos données sont propres !
            </div>
          ) : (
            <div className="space-y-3">
              {res.apprenants_par_email.length > 0 && (
                <DoublonBloc titre={`Apprenants avec le même email (${res.apprenants_par_email.length})`}>
                  {res.apprenants_par_email.map((g) => (
                    <li key={g.cle} className="flex items-center justify-between gap-2">
                      <span><span className="font-medium">{g.cle}</span> — {g.apprenants.map((a) => `${a.prenom} ${a.nom}`).join(", ")} ({g.apprenants.length} fiches)</span>
                      <button
                        onClick={() => fusionner(g)}
                        disabled={fusing === g.cle}
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                        data-testid={`fusion-btn-${g.cle}`}
                      >
                        <ArrowsMerge size={12} /> {fusing === g.cle ? "Fusion…" : "Fusionner"}
                      </button>
                    </li>
                  ))}
                </DoublonBloc>
              )}
              {res.apprenants_par_nom.length > 0 && (
                <DoublonBloc titre={`Apprenants avec le même nom + prénom (${res.apprenants_par_nom.length})`}>
                  {res.apprenants_par_nom.map((g) => (
                    <li key={g.cle} className="flex items-center justify-between gap-2">
                      <span><span className="font-medium">{g.cle}</span> — {g.apprenants.length} fiches (emails : {g.apprenants.map((a) => a.email || "aucun").join(" / ")})</span>
                      <button
                        onClick={() => fusionner(g)}
                        disabled={fusing === g.cle}
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                        data-testid={`fusion-nom-btn-${g.cle}`}
                      >
                        <ArrowsMerge size={12} /> {fusing === g.cle ? "Fusion…" : "Fusionner"}
                      </button>
                    </li>
                  ))}
                </DoublonBloc>
              )}
              {res.factures_par_numero.length > 0 && (
                <DoublonBloc titre={`Factures avec le même numéro (${res.factures_par_numero.length})`}>
                  {res.factures_par_numero.map((g) => (
                    <li key={g.cle}><span className="font-medium">{g.cle}</span> — {g.factures.length} factures ({g.factures.map((f) => `${f.montant} €`).join(" / ")})</li>
                  ))}
                </DoublonBloc>
              )}
            </div>
          )}
          {res.dossiers_multi_factures.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              ℹ️ {res.dossiers_multi_factures.length} dossier(s) CPF avec plusieurs factures — c'est souvent normal (facturation en plusieurs fois), à vérifier seulement en cas de doute.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DoublonBloc({ titre, children }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1.5">
        <Warning size={14} /> {titre}
      </div>
      <ul className="list-disc pl-4 space-y-1 text-xs text-amber-900 max-h-48 overflow-y-auto">{children}</ul>
    </div>
  );
}

export default function Parametres() {
  return (
    <div className="p-6 lg:p-8" data-testid="parametres-page">
      <header className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Configuration</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 mt-1">Paramètres</h1>
        <p className="text-sm text-slate-500 mt-1">Configurez votre organisme, votre marque et vos intégrations.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section icon={Buildings} title="Identité de l'organisme" description="Vos coordonnées et informations légales — reprises sur tous les documents PDF.">
          <OrganismeIdentite />
        </Section>

        <Section icon={Detective} title="Qualité des données" description="Détection des doublons (apprenants et factures CPF).">
          <QualiteDonnees />
        </Section>

        <Section icon={Palette} title="Marque & catalogue en ligne" description="Logo, slogan, charte couleur, mentions légales." mocked>
          <div className="space-y-3 text-sm text-slate-600">
            <p className="text-xs">Personnalisez votre identité visuelle et votre catalogue public.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-700">Slogan</Label>
                <Input className="mt-1" placeholder="Apprenez aujourd'hui, dirigez demain." />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Site web</Label>
                <Input className="mt-1" placeholder="https://" />
              </div>
            </div>
          </div>
        </Section>

        <Section icon={Plug} title="Intégrations tierces" description="Connectez vos outils existants (mock).">
          <div className="space-y-2.5">
            {[
              { label: "Signature électronique (Yousign)", on: false },
              { label: "Envoi d'e-mails (Resend)", on: false },
              { label: "E-learning SCORM", on: false },
              { label: "Comptabilité (Pennylane)", on: false },
            ].map((it) => (
              <div key={it.label} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2">
                <div className="text-sm text-slate-700">{it.label}</div>
                <Switch defaultChecked={it.on} />
              </div>
            ))}
          </div>
        </Section>

        <Section icon={ShieldCheck} title="Conformité Qualiopi & BPF" description="Pilotez les indicateurs Qualiopi et le Bilan Pédagogique et Financier.">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-emerald-200 bg-emerald-50/50 rounded-md p-3">
              <div className="text-xs text-emerald-700 font-semibold">Qualiopi</div>
              <div className="font-display text-xl text-slate-900 mt-1">Certifié</div>
              <div className="text-[11px] text-slate-500 mt-1">Audit prévu 03/2027</div>
            </div>
            <div className="border border-brand-200 bg-brand-50/50 rounded-md p-3">
              <div className="text-xs text-brand-700 font-semibold">BPF</div>
              <div className="font-display text-xl text-slate-900 mt-1">À soumettre</div>
              <div className="text-[11px] text-slate-500 mt-1">Échéance 30/04</div>
            </div>
          </div>
        </Section>

        <Section icon={FileText} title="Modèles de documents" description="Personnalisez convocations, contrats, factures, attestations." mocked>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {["Convention", "Contrat", "Convocation", "Attestation", "Émargement", "Évaluation"].map((t) => (
              <div key={t} className="border border-slate-200 rounded-md px-3 py-2 text-slate-700">{t}</div>
            ))}
          </div>
        </Section>

        <Section icon={EnvelopeSimple} title="Modèles d'e-mails" description="Modèles d'e-mails transactionnels et marketing." mocked>
          <p className="text-xs text-slate-500">Bientôt disponible — relances apprenants, convocations automatiques, etc.</p>
        </Section>

        <Section icon={Bell} title="Notifications" description="Configurez les alertes pour votre équipe.">
          <div className="space-y-2.5">
            {["Nouvelle inscription apprenant", "Convocation envoyée", "Facture impayée", "Session terminée"].map((n) => (
              <div key={n} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2">
                <div className="text-sm text-slate-700">{n}</div>
                <Switch defaultChecked />
              </div>
            ))}
          </div>
        </Section>

        <Section icon={WheelchairMotion} title="Accessibilité (EDOF)" description="Politique d'accessibilité aux personnes en situation de handicap." mocked>
          <p className="text-xs text-slate-500">Module conforme au format EDOF — saisie de votre référent handicap et politique d&apos;accueil.</p>
        </Section>
      </div>
    </div>
  );
}
