import React from "react";
import { useAuth } from "@/context/AuthContext";
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
} from "@phosphor-icons/react";
import { toast } from "sonner";

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

export default function Parametres() {
  const { user } = useAuth();

  return (
    <div className="p-6 lg:p-8" data-testid="parametres-page">
      <header className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Configuration</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 mt-1">Paramètres</h1>
        <p className="text-sm text-slate-500 mt-1">Configurez votre organisme, votre marque et vos intégrations.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section icon={Buildings} title="Identité de l'organisme" description="Vos coordonnées et informations légales.">
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium text-slate-700">Nom de l&apos;organisme</Label>
              <Input className="mt-1" defaultValue={user?.organisme} data-testid="org-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-700">SIRET</Label>
                <Input className="mt-1" placeholder="12345678900012" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Numéro de déclaration</Label>
                <Input className="mt-1" placeholder="11 75 12345 75" />
              </div>
            </div>
            <Button onClick={() => toast.success("Paramètres enregistrés (mock MVP)")} className="bg-brand-600 hover:bg-brand-700">Enregistrer</Button>
          </div>
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
