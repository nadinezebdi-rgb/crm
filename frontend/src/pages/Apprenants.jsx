import React from "react";
import CrudPage from "@/components/CrudPage";
import ImportEdofDialog from "@/components/ImportEdofDialog";

export default function Apprenants() {
  return (
    <CrudPage
      title="Apprenants"
      subtitle="Vos stagiaires et bénéficiaires de formation."
      endpoint="apprenants"
      testid="apprenants-page"
      extraActions={(reload) => <ImportEdofDialog onDone={reload} />}
      columns={[
        { key: "prenom", label: "Prénom" },
        { key: "nom", label: "Nom" },
        { key: "email", label: "Email" },
        { key: "telephone", label: "Téléphone" },
        { key: "dossier_cpf", label: "N° dossier CPF" },
      ]}
      blank={{ nom: "", prenom: "", email: "", telephone: "", date_naissance: "", adresse: "", dossier_cpf: "", notes: "" }}
      fields={[
        { key: "prenom", label: "Prénom *" },
        { key: "nom", label: "Nom *" },
        { key: "email", label: "Email", type: "email" },
        { key: "telephone", label: "Téléphone" },
        { key: "date_naissance", label: "Date de naissance", type: "date" },
        { key: "dossier_cpf", label: "N° dossier CPF" },
        { key: "adresse", label: "Adresse", full: true },
        { key: "notes", label: "Notes", type: "textarea", full: true },
      ]}
    />
  );
}
