import React from "react";
import CrudPage from "@/components/CrudPage";
import { Badge } from "@/components/ui/badge";

export default function Financeurs() {
  return (
    <CrudPage
      title="Financeurs"
      subtitle="OPCO, Pôle Emploi, CPF et autres organismes financeurs."
      endpoint="financeurs"
      testid="financeurs-page"
      columns={[
        { key: "nom", label: "Nom" },
        { key: "type_financeur", label: "Type", render: (f) => <Badge variant="outline" className="border-slate-200 uppercase tracking-wider text-[10px]">{f.type_financeur}</Badge> },
        { key: "code", label: "Code" },
        { key: "email", label: "Email" },
      ]}
      blank={{ nom: "", type_financeur: "opco", code: "", email: "", telephone: "", adresse: "", notes: "" }}
      fields={[
        { key: "nom", label: "Nom *", full: true },
        { key: "type_financeur", label: "Type", type: "select", options: [
          { value: "opco", label: "OPCO" },
          { value: "pole_emploi", label: "Pôle Emploi / France Travail" },
          { value: "cpf", label: "CPF" },
          { value: "entreprise", label: "Entreprise" },
          { value: "autre", label: "Autre" },
        ]},
        { key: "code", label: "Code" },
        { key: "email", label: "Email", type: "email" },
        { key: "telephone", label: "Téléphone" },
        { key: "adresse", label: "Adresse", full: true },
        { key: "notes", label: "Notes", type: "textarea", full: true },
      ]}
    />
  );
}
