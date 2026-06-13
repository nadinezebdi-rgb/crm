import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { API_BASE } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  CalendarBlank,
  MapPin,
  Users,
  ChalkboardTeacher,
  FilePdf,
  CheckCircle,
  Clock,
  WarningCircle,
  Buildings,
  ChartBar,
  CurrencyEur,
  FileText,
  Envelope,
  Receipt,
  Certificate,
  ClipboardText,
  ShareNetwork,
  FolderSimplePlus,
  Trash,
} from "@phosphor-icons/react";
import { statusBadgeClass } from "./Dashboard";

const CHECK_META = [
  { key: "dates_creneaux", label: "Dates & créneaux", icon: CalendarBlank, color: "blue" },
  { key: "contrats_conventions", label: "Contrats & conventions", icon: FileText, color: "indigo" },
  { key: "parametres", label: "Paramètres", icon: ChartBar, color: "slate" },
  { key: "emargements", label: "Émargements", icon: ClipboardText, color: "amber" },
  { key: "convocations", label: "Convocations", icon: Envelope, color: "violet" },
  { key: "evaluations", label: "Évaluations", icon: CheckCircle, color: "emerald" },
  { key: "factures", label: "Factures", icon: Receipt, color: "rose" },
  { key: "attestations", label: "Attestations", icon: Certificate, color: "teal" },
];

const DOC_TYPES = [
  { type: "convention", label: "Convention de formation", icon: FileText },
  { type: "contrat", label: "Contrat de formation", icon: FileText },
  { type: "convocation", label: "Convocation", icon: Envelope },
  { type: "attestation", label: "Attestation", icon: Certificate },
  { type: "facture", label: "Facture", icon: Receipt },
  { type: "emargement", label: "Feuille d'émargement", icon: ClipboardText },
  { type: "programme", label: "Programme", icon: ChartBar },
  { type: "evaluation", label: "Évaluation", icon: CheckCircle },
];

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [refs, setRefs] = useState({ entreprises: [], formateurs: [], apprenants: [], lieux: [], financeurs: [] });
  const [loading, setLoading] = useState(true);
  const [classing, setClassing] = useState(null);

  const classerDocument = async (docType) => {
    setClassing(docType);
    try {
      const { data } = await api.post(`/documents/session/${id}/${docType}/classer`);
      toast.success(`Document classé dans ${data.classes} fiche(s) stagiaire(s)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Classement impossible");
    } finally {
      setClassing(null);
    }
  };

  const deleteSession = async () => {
    if (!window.confirm(`Supprimer définitivement la session « ${session?.nom} » ?\n\nCette action est irréversible. Les documents générés (PDFs déjà classés dans les fiches stagiaires) ne seront pas supprimés.`)) return;
    try {
      await api.delete(`/sessions/${id}`);
      toast.success("Session supprimée");
      navigate("/sessions");
    } catch (e) {
      toast.error("Suppression impossible");
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [s, e, f, a, l, fi] = await Promise.all([
        api.get(`/sessions/${id}`),
        api.get(`/entreprises`),
        api.get(`/formateurs`),
        api.get(`/apprenants`),
        api.get(`/lieux`),
        api.get(`/financeurs`),
      ]);
      setSession(s.data);
      setRefs({ entreprises: e.data, formateurs: f.data, apprenants: a.data, lieux: l.data, financeurs: fi.data });
    } catch {
      toast.error("Session introuvable");
      navigate("/sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading || !session) return <div className="p-8 text-slate-500">Chargement…</div>;

  const lieu = refs.lieux.find((l) => l.id === session.lieu_id);
  const entreprise = refs.entreprises.find((e) => e.id === session.entreprise_id);
  const financeur = refs.financeurs.find((f) => f.id === session.financeur_id);
  const formateurs = refs.formateurs.filter((f) => session.formateurs?.includes(f.id));
  const apprenants = refs.apprenants.filter((a) => session.apprenants?.includes(a.id));

  const toggleProgress = async (field, value) => {
    try {
      const { data } = await api.patch(`/sessions/${id}/progression`, { [field]: value });
      setSession(data);
      toast.success("Mise à jour enregistrée");
    } catch {
      toast.error("Erreur de mise à jour");
    }
  };

  const changeStatus = async (statut) => {
    try {
      const { data } = await api.patch(`/sessions/${id}/statut`, { statut });
      setSession(data);
      toast.success("Statut mis à jour");
    } catch { toast.error("Échec"); }
  };

  return (
    <div className="p-6 lg:p-8" data-testid="session-detail-page">
      <button onClick={() => navigate("/sessions")} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-3">
        <ArrowLeft size={12} /> Retour
      </button>

      <div className="flex justify-end mb-3">
        <Button
          variant="outline"
          onClick={deleteSession}
          data-testid="session-detail-delete-btn"
          className="border-red-200 text-red-700 hover:bg-red-50"
        >
          <Trash size={14} className="mr-1.5" /> Supprimer la session
        </Button>
      </div>

      {/* Bandeau permanent */}
      <Card className="border-slate-200 shadow-none p-5 mb-6" data-testid="session-banner">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-500 font-mono">
              {session.code_interne}
              <Badge className={`text-[10px] uppercase tracking-wider ${statusBadgeClass(session.statut)}`}>
                {session.statut}
              </Badge>
              {session.distanciel && <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-brand-200 text-brand-700 bg-brand-50">Distanciel</Badge>}
              {session.inclus_bpf && <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-emerald-200 text-emerald-700 bg-emerald-50">Inclus BPF</Badge>}
            </div>
            <h1 className="font-display text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900 mt-1.5 truncate">{session.nom}</h1>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {session.date_debut && <span className="inline-flex items-center gap-1"><CalendarBlank size={12} /> {session.date_debut} → {session.date_fin}</span>}
              {lieu && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {lieu.nom}{lieu.ville ? `, ${lieu.ville}` : ""}</span>}
              {entreprise && <span className="inline-flex items-center gap-1"><Buildings size={12} /> {entreprise.raison_sociale}</span>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 lg:gap-6 shrink-0">
            <Metric label="Chiffre d'affaires" value={`${(session.ca || 0).toLocaleString("fr-FR")} €`} icon={CurrencyEur} />
            <Metric label="Taux de marge" value={`${session.taux_marge}%`} icon={ChartBar} />
            <Metric label="Progression" value={`${session.progression.percent}%`} icon={CheckCircle} progress={session.progression.percent} />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500">Changer le statut :</span>
          <Select value={session.statut} onValueChange={changeStatus}>
            <SelectTrigger className="w-44 h-8" data-testid="session-status-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="brouillon">Brouillon</SelectItem>
              <SelectItem value="planification">En planification</SelectItem>
              <SelectItem value="planifiee">Planifiée</SelectItem>
              <SelectItem value="terminee">Terminée</SelectItem>
              <SelectItem value="archivee">Archivée</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Tabs defaultValue="progression" className="w-full" data-testid="session-tabs">
        <TabsList className="bg-transparent p-0 h-auto border-b border-slate-200 w-full justify-start rounded-none gap-1">
          <SessionTabTrigger value="progression" label="Progression" testid="tab-progression" />
          <SessionTabTrigger value="parametres" label="Paramètres" testid="tab-parametres" />
          <SessionTabTrigger value="gestion" label="Gestion" testid="tab-gestion" />
          <SessionTabTrigger value="portail" label="Portail apprenants" testid="tab-portail" />
        </TabsList>

        {/* PROGRESSION */}
        <TabsContent value="progression" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-1 p-5 border-slate-200 shadow-none">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Avancement global</div>
              <div className="font-display text-4xl font-semibold text-slate-900 mt-2">{session.progression.done}/{session.progression.total}</div>
              <div className="text-xs text-slate-500 mt-1">étapes complétées</div>
              <Progress value={session.progression.percent} className="h-2 mt-4" />
              <div className="mt-5 text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-md p-3">
                <span className="font-semibold text-slate-800">Conformité Qualiopi.</span> Complétez chaque carte pour atteindre 100% et préparer un audit en toute sérénité.
              </div>
            </Card>

            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CHECK_META.map((m) => {
                const done = session.progression.checks[m.key];
                const editable = ["convocations", "evaluations", "factures", "attestations"].includes(m.key);
                const field = m.key === "convocations" ? "convocations_envoyees"
                  : m.key === "evaluations" ? "evaluations_envoyees"
                  : m.key === "factures" ? "factures_emises"
                  : m.key === "attestations" ? "attestations_emises"
                  : null;
                return (
                  <Card key={m.key} className={`p-4 border-slate-200 shadow-none transition-colors ${done ? "bg-emerald-50/50 border-emerald-200" : ""}`} data-testid={`check-${m.key}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          <m.icon size={16} weight="duotone" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{m.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{done ? "Validé" : "À compléter"}</div>
                        </div>
                      </div>
                      {done ? <CheckCircle size={20} weight="fill" className="text-emerald-600" /> : <WarningCircle size={20} className="text-slate-300" />}
                    </div>
                    {editable && field && (
                      <Button
                        variant={done ? "outline" : "default"}
                        size="sm"
                        onClick={() => toggleProgress(field, !done)}
                        className={`mt-3 w-full h-8 text-xs ${done ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "bg-slate-900 hover:bg-slate-800"}`}
                        data-testid={`toggle-${m.key}`}
                      >
                        {done ? "Marquer comme à refaire" : "Marquer comme validé"}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* PARAMETRES */}
        <TabsContent value="parametres" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <DetailSection title="Configuration générale">
              <DetailRow label="Type de session" value={session.type_session.replace("_", " ")} />
              <DetailRow label="Type d'action" value={session.type_action.replace("_", " ")} />
              <DetailRow label="Fuseau" value={session.fuseau_horaire} />
              <DetailRow label="Formation interne" value={session.formation_interne ? "Oui" : "Non"} />
              <DetailRow label="Sous-traitance" value={session.sous_traitance ? "Oui" : "Non"} />
              <DetailRow label="Retirée du catalogue" value={session.retire_catalogue ? "Oui" : "Non"} />
            </DetailSection>
            <DetailSection title="Dates & tarifs">
              <DetailRow label="Date début" value={session.date_debut || "—"} />
              <DetailRow label="Date fin" value={session.date_fin || "—"} />
              <DetailRow label="Prix HT" value={`${(session.prix_ht || 0).toLocaleString("fr-FR")} €`} />
              <DetailRow label="Coût HT" value={`${(session.cout_ht || 0).toLocaleString("fr-FR")} €`} />
              <DetailRow label="Marge" value={`${(session.marge || 0).toLocaleString("fr-FR")} €`} />
              <DetailRow label="Inclus BPF" value={session.inclus_bpf ? "Oui" : "Non"} />
            </DetailSection>

            <DetailSection title="Apprenants" testid="apprenants-section">
              {apprenants.length === 0 ? <Empty msg="Aucun apprenant rattaché." /> : (
                <ul className="divide-y divide-slate-100">
                  {apprenants.map((a) => (
                    <li key={a.id} className="py-2.5 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-700 text-xs font-medium flex items-center justify-center">
                        {a.prenom[0]}{a.nom[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900">{a.prenom} {a.nom}</div>
                        <div className="text-[11px] text-slate-500">{a.email || "—"}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Formateurs">
              {formateurs.length === 0 ? <Empty msg="Aucun formateur rattaché." /> : (
                <ul className="divide-y divide-slate-100">
                  {formateurs.map((f) => (
                    <li key={f.id} className="py-2.5 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-50 text-brand-700 text-xs font-medium flex items-center justify-center">
                        {f.prenom[0]}{f.nom[0]}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">{f.prenom} {f.nom} {!f.interne && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Externe</span>}</div>
                        <div className="text-[11px] text-slate-500">{f.specialites?.join(" • ") || "—"}</div>
                      </div>
                      <div className="text-xs font-mono text-slate-700">{f.tarif_journalier} €/j</div>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Programme">
              <DetailRow label="Programme" value={session.programme || "—"} />
              <DetailRow label="Catégorie" value={session.categorie || "—"} />
              <DetailRow label="Niveau" value={session.niveau || "—"} />
              <DetailRow label="Description" value={session.description || "—"} />
            </DetailSection>
          </div>
        </TabsContent>

        {/* GESTION */}
        <TabsContent value="gestion" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {DOC_TYPES.map((d) => (
              <Card key={d.type} className="p-4 border-slate-200 shadow-none hover:border-brand-300 transition-colors group" data-testid={`doc-${d.type}`}>
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
                    <d.icon size={18} weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">{d.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">PDF généré à la demande</div>
                  </div>
                </div>
                <a
                  href={`${API_BASE}/documents/session/${session.id}/${d.type}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center justify-center gap-1.5 w-full h-8 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
                  data-testid={`generate-${d.type}`}
                >
                  <FilePdf size={14} /> Générer le PDF
                </a>
                <button
                  onClick={() => classerDocument(d.type)}
                  disabled={classing === d.type}
                  className="mt-1.5 inline-flex items-center justify-center gap-1.5 w-full h-8 rounded-md bg-brand-50 border border-brand-200 hover:bg-brand-100 text-xs font-medium text-brand-700 transition-colors disabled:opacity-50"
                  data-testid={`classer-${d.type}`}
                >
                  <FolderSimplePlus size={14} /> {classing === d.type ? "Classement…" : "Classer dans les fiches"}
                </button>
              </Card>
            ))}
          </div>

          <Card className="mt-5 p-5 border-slate-200 shadow-none">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Espace entreprise</div>
            <div className="font-display text-lg font-medium text-slate-900 mt-0.5 mb-3">Coordonnées du donneur d&apos;ordre</div>
            {entreprise ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div><div className="text-xs text-slate-500">Raison sociale</div><div className="font-medium text-slate-900">{entreprise.raison_sociale}</div></div>
                <div><div className="text-xs text-slate-500">SIRET</div><div className="font-mono text-slate-700">{entreprise.siret || "—"}</div></div>
                <div><div className="text-xs text-slate-500">Contact</div><div className="text-slate-700">{entreprise.contact_nom || "—"} • {entreprise.email || "—"}</div></div>
              </div>
            ) : <Empty msg="Aucune entreprise rattachée." />}

            {financeur && (
              <div className="mt-4 pt-4 border-t border-slate-100 text-sm">
                <div className="text-xs text-slate-500 mb-1">Financeur</div>
                <div className="font-medium text-slate-900">{financeur.nom} <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 uppercase tracking-wider">{financeur.type_financeur}</span></div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* PORTAIL */}
        <TabsContent value="portail" className="mt-6">
          <Card className="p-6 border-slate-200 shadow-none">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center">
                <ShareNetwork size={22} weight="duotone" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Portail apprenants</div>
                <h3 className="font-display text-xl font-semibold tracking-tight text-slate-900 mt-1">Lien public de la session</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-2xl">Vos apprenants peuvent consulter leur programme, leurs documents et leurs évaluations depuis un portail dédié à votre marque.</p>
                <div className="mt-4 flex items-center gap-2 max-w-xl">
                  <input
                    readOnly
                    value={`${window.location.origin}/portail/${session.id}`}
                    className="flex-1 h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700"
                    data-testid="portal-url"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/portail/${session.id}`);
                      toast.success("Lien copié");
                    }}
                    className="h-9 border-slate-200"
                    data-testid="copy-portal-link"
                  >Copier</Button>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PortalTile icon={Users} label="Apprenants" value={apprenants.length} />
                  <PortalTile icon={ChalkboardTeacher} label="Formateurs" value={formateurs.length} />
                  <PortalTile icon={FileText} label="Documents disponibles" value={DOC_TYPES.length} />
                </div>
                <div className="mt-5 text-[11px] text-slate-500 italic flex items-center gap-1.5">
                  <Clock size={12} /> Le portail public sera activé dans la prochaine itération (mock pour le MVP).
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionTabTrigger({ value, label, testid }) {
  return (
    <TabsTrigger
      value={value}
      data-testid={testid}
      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-600 data-[state=active]:text-slate-900 text-slate-500 rounded-none px-4 h-10 font-medium text-sm"
    >
      {label}
    </TabsTrigger>
  );
}

function Metric({ label, value, icon: Icon, progress }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold flex items-center justify-end gap-1">
        <Icon size={11} /> {label}
      </div>
      <div className="font-display text-xl font-semibold text-slate-900 mt-1">{value}</div>
      {typeof progress === "number" && <Progress value={progress} className="h-1 mt-1.5 w-24 ml-auto" />}
    </div>
  );
}

function DetailSection({ title, children, testid }) {
  return (
    <Card className="p-5 border-slate-200 shadow-none" data-testid={testid}>
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">{title}</div>
      {children}
    </Card>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-50 last:border-0 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

function Empty({ msg }) {
  return <div className="text-sm text-slate-400 italic py-2">{msg}</div>;
}

function PortalTile({ icon: Icon, label, value }) {
  return (
    <div className="border border-slate-200 rounded-md p-3 flex items-center gap-3">
      <Icon size={18} className="text-slate-400" />
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
        <div className="font-display text-lg font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}
