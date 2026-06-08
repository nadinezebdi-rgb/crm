import React from "react";
import CrudPage from "@/components/CrudPage";
import { Badge } from "@/components/ui/badge";

export default function Lieux() {
  return (
    <CrudPage
      title="Lieux & salles"
      subtitle="Vos salles de formation et lieux distanciels."
      endpoint="lieux"
      testid="lieux-page"
      columns={[
        { key: "nom", label: "Nom" },
        { key: "ville", label: "Ville" },
        { key: "capacite", label: "Capacité", render: (l) => `${l.capacite} pers.` },
        { key: "type", label: "Type", render: (l) => l.distanciel ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Distanciel</Badge> : <Badge variant="outline">Présentiel</Badge> },
      ]}
      blank={{ nom: "", adresse: "", code_postal: "", ville: "", capacite: 10, equipements: [], distanciel: false, notes: "" }}
      fields={[
        { key: "nom", label: "Nom *", full: true },
        { key: "adresse", label: "Adresse", full: true },
        { key: "code_postal", label: "Code postal" },
        { key: "ville", label: "Ville" },
        { key: "capacite", label: "Capacité (pers.)", type: "number" },
        { key: "distanciel", label: "Distanciel", type: "checkbox", hint: "Lieu virtuel (visio)" },
        { key: "notes", label: "Notes / équipements", type: "textarea", full: true },
      ]}
    />
  );
}
