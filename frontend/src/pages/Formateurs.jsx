import React from "react";
import CrudPage from "@/components/CrudPage";
import { Badge } from "@/components/ui/badge";

export default function Formateurs() {
  return (
    <CrudPage
      title="Formateurs"
      subtitle="Vos formateurs internes et externes."
      endpoint="formateurs"
      testid="formateurs-page"
      columns={[
        { key: "prenom", label: "Prénom" },
        { key: "nom", label: "Nom" },
        { key: "type", label: "Statut", render: (f) => <Badge variant="outline" className={f.interne ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{f.interne ? "Interne" : "Externe"}</Badge> },
        { key: "email", label: "Email" },
        { key: "tarif_journalier", label: "Tarif/j", render: (f) => `${f.tarif_journalier || 0} €` },
      ]}
      blank={{ nom: "", prenom: "", email: "", telephone: "", interne: true, specialites: [], tarif_journalier: 0, notes: "" }}
      fields={[
        { key: "prenom", label: "Prénom *" },
        { key: "nom", label: "Nom *" },
        { key: "email", label: "Email", type: "email" },
        { key: "telephone", label: "Téléphone" },
        { key: "interne", label: "Formateur interne", type: "checkbox", hint: "Coché = salarié de l'organisme" },
        { key: "tarif_journalier", label: "Tarif journalier (€)", type: "number" },
        { key: "notes", label: "Notes", type: "textarea", full: true },
      ]}
    />
  );
}
