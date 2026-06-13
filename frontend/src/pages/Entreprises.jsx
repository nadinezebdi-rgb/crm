import React from "react";
import CrudPage from "@/components/CrudPage";

export default function Entreprises() {
  return (
    <CrudPage
      title="Entreprises clientes"
      subtitle="Vos donneurs d'ordre et clients professionnels."
      endpoint="entreprises"
      testid="entreprises-page"
      columns={[
        { key: "raison_sociale", label: "Raison sociale" },
        { key: "siret", label: "SIRET" },
        { key: "ville", label: "Ville" },
        { key: "contact_nom", label: "Contact" },
        { key: "email", label: "Email" },
      ]}
      blank={{ raison_sociale: "", siret: "", adresse: "", code_postal: "", ville: "", email: "", telephone: "", contact_nom: "", notes: "" }}
      fields={[
        { key: "raison_sociale", label: "Raison sociale *", full: true },
        { key: "siret", label: "SIRET" },
        { key: "contact_nom", label: "Nom du contact" },
        { key: "email", label: "Email", type: "email" },
        { key: "telephone", label: "Téléphone" },
        { key: "adresse", label: "Adresse", full: true },
        { key: "code_postal", label: "Code postal" },
        { key: "ville", label: "Ville" },
        { key: "notes", label: "Notes", type: "textarea", full: true },
      ]}
    />
  );
}
